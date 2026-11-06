import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createApp } from '../server/app.js'
import { createStore, type Store } from '../server/store.js'
import { HttpError } from '../server/errors.js'
import { noImage } from '../server/images.js'
import { bootstrapSchema, saveResultSchema } from '../shared/model.js'

let directory: string
let store: Store
let app: ReturnType<typeof createApp>
let token: string
const saveImage = vi.fn(async () => noImage)
const input = { url: 'https://shop.example/chair?color=green', title: 'Green chair', tags: ['home'], notes: 'For the reading corner' }

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'my-board-test-'))
  store = createStore(path.join(directory, 'board.sqlite'))
  saveImage.mockReset().mockResolvedValue(noImage)
  app = createApp({ store, dataDirectory: directory, root: process.cwd(), saveImage })
  const response = await request(app).get('/api/bootstrap').expect(200)
  token = bootstrapSchema.parse(response.body).token
})

afterEach(async () => {
  store.close()
  await rm(directory, { recursive: true, force: true })
})

describe('private local API', () => {
  it('requires a key for writes and blocks untrusted origins and Host headers', async () => {
    await request(app).post('/api/pins').send(input).expect(401)
    await request(app).get('/api/bootstrap').set('Origin', 'https://evil.example').expect(403)
    await request(app).get('/api/bootstrap').set('Host', 'rebind.example').expect(403)
    await request(app).get('/api/bootstrap').set('Sec-Fetch-Site', 'cross-site').expect(403)
    expect(store.list()).toHaveLength(0)
  })

  it('allows a paired Safari extension without exposing bootstrap to extensions', async () => {
    const origin = 'safari-web-extension://E89B9FC5-4661-4DD0-BBC1-4971220873D5'
    const response = await request(app).post('/api/pins').set('Origin', origin).set('Sec-Fetch-Site', 'cross-site')
      .set('Authorization', `Bearer ${token}`).send(input).expect(201)
    expect(response.headers['access-control-allow-origin']).toBe(origin)
    await request(app).get('/api/bootstrap').set('Origin', origin).expect(403)
    await request(app).options('/api/pins').set('Origin', origin).expect(204)
  })

  it('deduplicates canonical links without overwriting existing notes or downloading twice', async () => {
    await request(app).post('/api/pins').set('Authorization', `Bearer ${token}`).send(input).expect(201)
    const response = await request(app).post('/api/pins').set('Authorization', `Bearer ${token}`)
      .send({ ...input, url: `${input.url}&utm_source=facebook&fbclid=tracking`, notes: 'Do not overwrite me' }).expect(200)
    const result = saveResultSchema.parse(response.body)
    expect(result.created).toBe(false)
    expect(result.pin.notes).toBe(input.notes)
    expect(store.list()).toHaveLength(1)
    expect(saveImage).toHaveBeenCalledTimes(1)
  })

  it('persists products and the connection key across a database reopen', async () => {
    await request(app).post('/api/pins').set('Authorization', `Bearer ${token}`).send(input).expect(201)
    store.close()
    store = createStore(path.join(directory, 'board.sqlite'))
    app = createApp({ store, dataDirectory: directory, root: process.cwd(), saveImage })
    const result = bootstrapSchema.parse((await request(app).get('/api/bootstrap').expect(200)).body)
    expect(result.token).toBe(token)
    expect(result.pins[0]).toMatchObject({ title: input.title, tags: input.tags, notes: input.notes })
  })

  it('edits, favorites, and removes a saved find', async () => {
    const { pin } = saveResultSchema.parse((await request(app).post('/api/pins').set('Authorization', `Bearer ${token}`).send(input).expect(201)).body)
    await request(app).put(`/api/pins/${pin.id}`).set('Authorization', `Bearer ${token}`).send({ ...input, tags: ['green', 'office'], notes: 'Updated note' }).expect(200)
    await request(app).patch(`/api/pins/${pin.id}`).set('Authorization', `Bearer ${token}`).send({ favorite: true }).expect(200)
    expect(store.get(pin.id)).toMatchObject({ favorite: true, notes: 'Updated note', tags: ['green', 'office'] })
    await request(app).delete(`/api/pins/${pin.id}`).set('Authorization', `Bearer ${token}`).expect(204)
    expect(store.list()).toEqual([])
  })

  it('does not report success or create a broken record when image storage fails', async () => {
    saveImage.mockRejectedValueOnce(new HttpError(422, 'The picture could not be saved.'))
    const response = await request(app).post('/api/pins').set('Authorization', `Bearer ${token}`)
      .send({ ...input, imageUrl: 'https://shop.example/picture.jpg' }).expect(422)
    expect(response.body.error).toBe('The picture could not be saved.')
    expect(store.list()).toHaveLength(0)
  })

  it('keeps product variants separate and refuses edits that collide with another link', async () => {
    const first = saveResultSchema.parse((await request(app).post('/api/pins').set('Authorization', `Bearer ${token}`).send(input)).body)
    const other = { ...input, url: 'https://shop.example/chair?color=red' }
    await request(app).post('/api/pins').set('Authorization', `Bearer ${token}`).send(other).expect(201)
    await request(app).put(`/api/pins/${first.pin.id}`).set('Authorization', `Bearer ${token}`).send(other).expect(409)
    expect(store.list()).toHaveLength(2)
  })
})
