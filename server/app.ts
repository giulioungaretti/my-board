import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import { parseHTML } from 'linkedom'
import { z } from 'zod'
import { canonicalizeUrl, pinInputSchema, webUrlSchema } from '../shared/model.js'
import { extractPageMetadata } from '../shared/metadata.js'
import { HttpError } from './errors.js'
import { storeImage, type StoredImage } from './images.js'
import { fetchPublicResource } from './network.js'
import type { Store } from './store.js'

export type AppOptions = {
  store: Store
  dataDirectory: string
  root: string
  warnings?: readonly string[]
  saveImage?: (url: string | null, directory: string) => Promise<StoredImage>
}

export function createApp({ store, dataDirectory, root, warnings = [], saveImage = storeImage }: AppOptions) {
  const app = express()
  app.disable('x-powered-by')
  const token = store.setting('extension-token') ?? randomBytes(32).toString('hex')
  store.setSetting('extension-token', token)

  app.use((request, response, next) => {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(request.hostname)) {
      response.status(403).json({ error: 'My Board only accepts connections to localhost.' })
      return
    }
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'no-referrer')
    next()
  })

  app.use('/api', (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    const origin = request.get('Origin')
    const extension = !!origin && /^(safari-web-extension|moz-extension|chrome-extension):\/\/[a-zA-Z0-9-]+$/.test(origin)
    const sameOrigin = !origin || origin === `http://${request.get('Host')}`
    if ((!sameOrigin && !extension) || (!extension && request.get('Sec-Fetch-Site') === 'cross-site')) {
      response.status(403).json({ error: 'This origin is not allowed to access your board.' })
      return
    }
    if (request.path === '/bootstrap' && extension) {
      response.status(403).json({ error: 'Copy the connection key from My Board to pair this extension.' })
      return
    }
    if (extension) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
    if (request.method === 'OPTIONS') {
      response.sendStatus(204)
      return
    }
    if (request.path === '/bootstrap' && request.method === 'GET') {
      next()
      return
    }
    const provided = Buffer.from(request.get('Authorization')?.replace(/^Bearer /, '') ?? '')
    const expected = Buffer.from(token)
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      response.status(401).json({ error: 'The connection key is missing or incorrect. Copy it from My Board and reconnect.' })
      return
    }
    next()
  })
  app.use('/api', express.json({ limit: '64kb' }))

  app.get('/api/bootstrap', (_request, response) => {
    response.json({
      token,
      pins: store.list(),
      warnings,
      extensionAvailable: existsSync(path.join(root, 'dist/downloads/my-board-extension.zip')),
    })
  })
  app.get('/api/pins', (_request, response) => response.json(store.list()))
  app.post('/api/preview', async (request, response) => {
    const { url } = z.object({ url: webUrlSchema }).parse(request.body)
    const resource = await fetchPublicResource(url, 3 * 1024 * 1024)
    if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(resource.contentType)) {
      throw new HttpError(422, 'That link is not a web page. You can still enter a name and image manually.')
    }
    const { document } = parseHTML(resource.body.toString('utf8'))
    const metadata = extractPageMetadata(document, resource.url)
    response.json({ ...metadata, url: canonicalizeUrl(metadata.url) })
  })
  app.post('/api/pins', async (request, response) => {
    const input = pinInputSchema.parse(request.body)
    const existing = store.byUrl(input.url)
    if (existing) {
      response.json({ pin: existing, created: false })
      return
    }
    const image = await saveImage(input.imageUrl, path.join(dataDirectory, 'images'))
    const result = store.create(input, image)
    response.status(result.created ? 201 : 200).json(result)
  })
  app.put('/api/pins/:id', async (request, response) => {
    const id = z.string().uuid().parse(request.params.id)
    const existing = store.get(id)
    if (!existing) throw new HttpError(404, 'This find no longer exists. Refresh your board.')
    const input = pinInputSchema.parse(request.body)
    const image = input.imageUrl === existing.imageUrl ? existing
      : await saveImage(input.imageUrl, path.join(dataDirectory, 'images'))
    response.json(store.update(id, input, image))
  })
  app.patch('/api/pins/:id', (request, response) => {
    const id = z.string().uuid().parse(request.params.id)
    const { favorite } = z.object({ favorite: z.boolean() }).strict().parse(request.body)
    const existing = store.get(id)
    if (!existing) throw new HttpError(404, 'This find no longer exists. Refresh your board.')
    response.json(store.update(id, { ...existing, favorite }, existing))
  })
  app.delete('/api/pins/:id', (request, response) => {
    const id = z.string().uuid().parse(request.params.id)
    store.remove(id)
    response.status(204).end()
  })
  app.get('/api/export', (_request, response) => {
    response.json({ version: 1, exportedAt: new Date().toISOString(), pins: store.list() })
  })
  app.use('/api', (_request, response) => response.status(404).json({ error: 'This API endpoint does not exist.' }))
  app.use('/media', express.static(path.join(dataDirectory, 'images'), {
    immutable: true,
    maxAge: '1y',
    dotfiles: 'deny',
    index: false,
  }))
  app.use('/downloads', express.static(path.join(root, 'dist/downloads'), { index: false }))

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error)
      return
    }
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: error.issues[0]?.message ?? 'Please check the product details.' })
    } else if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message })
    } else if (error instanceof SyntaxError) {
      response.status(400).json({ error: 'The request was not valid JSON.' })
    } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({ error: 'The submitted details are too large.' })
    } else {
      console.error('My Board request failed:', error)
      response.status(500).json({ error: 'Your changes could not be saved. Check the app terminal and try again.' })
    }
  }
  app.use(errorHandler)
  return app
}
