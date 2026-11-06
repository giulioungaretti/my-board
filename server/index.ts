import { mkdir, chmod } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import express from 'express'
import { createApp } from './app.js'
import { createStore } from './store.js'
import { storeImage } from './images.js'
import { firstFind } from './seed.js'
import { errorMessage } from '../shared/api.js'

const root = process.cwd()
const port = Number(process.env.PORT ?? 4317)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.')
const dataDirectory = path.resolve(process.env.BOARD_DATA_DIR ?? path.join(root, '.data'))
await mkdir(dataDirectory, { recursive: true, mode: 0o700 })
const databasePath = path.join(dataDirectory, 'board.sqlite')
const store = createStore(databasePath)
await chmod(databasePath, 0o600)
const warnings: string[] = []
if (process.env.BOARD_SEED !== '0' && !store.setting('initialized')) {
  try {
    const image = await storeImage(firstFind.imageUrl, path.join(dataDirectory, 'images'))
    store.create(firstFind, image)
    store.setSetting('initialized', '1')
  } catch (error) {
    const warning = `Your starting Corsair find could not be added. ${errorMessage(error)}`
    console.warn(warning)
    warnings.push(warning)
  }
}
const app = createApp({ store, dataDirectory, root, warnings })
const server = createServer(app)
let closeVite: (() => Promise<void>) | undefined
if (process.env.NODE_ENV === 'production') {
  app.use((_request, response, next) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' http: https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
    next()
  })
  app.use(express.static(path.join(root, 'dist'), { index: false }))
  app.get('/{*path}', (_request, response) => response.sendFile(path.join(root, 'dist/index.html')))
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  app.use(vite.middlewares)
  closeVite = () => vite.close()
}
server.listen(port, '127.0.0.1', () => console.log(`My Board is ready at http://127.0.0.1:${port}`))
server.on('error', (error) => {
  console.error('My Board could not start:', error.message)
  process.exitCode = 1
  void closeVite?.().finally(() => store.close())
})
let closing = false
const shutdown = () => {
  if (closing) return
  closing = true
  server.close(() => {
    void (closeVite?.() ?? Promise.resolve()).finally(() => {
      store.close()
      process.exit(0)
    })
  })
  server.closeIdleConnections()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
