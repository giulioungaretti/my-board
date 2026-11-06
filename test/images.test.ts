import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { storeImage } from '../server/images.js'
import { fetchPublicResource } from '../server/network.js'

vi.mock('../server/network.js', () => ({ fetchPublicResource: vi.fn() }))
let directory: string
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'my-board-image-test-')) })
afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.clearAllMocks() })

describe('local image copies', () => {
  it('stores a bounded, content-addressed image that can be read without its source website', async () => {
    const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#e9eae7' } }).png().toBuffer()
    vi.mocked(fetchPublicResource).mockResolvedValue({ body: input, contentType: 'image/png', url: 'https://shop.example/image.png' })
    const result = await storeImage('https://shop.example/image.png', directory)
    expect(result.imagePath).toMatch(/^\/media\/[a-f0-9]{64}\.webp$/)
    expect(result.imageWidth).toBe(1600)
    expect(result.imageHeight).toBe(800)
    const saved = await readFile(path.join(directory, path.basename(result.imagePath ?? 'missing')))
    expect((await sharp(saved).metadata()).format).toBe('webp')
    expect(await storeImage('https://shop.example/image.png', directory)).toEqual(result)
  })

  it('refuses HTML and SVG even when supplied as the product image', async () => {
    for (const contentType of ['text/html', 'image/svg+xml']) {
      vi.mocked(fetchPublicResource).mockResolvedValue({ body: Buffer.from('<svg/>'), contentType, url: 'https://shop.example/image' })
      await expect(storeImage('https://shop.example/image', directory)).rejects.toThrow('not a supported image')
    }
  })
})
