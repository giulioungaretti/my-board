import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type OutputInfo } from 'sharp'
import { fetchPublicResource } from './network.js'
import { HttpError } from './errors.js'

export type StoredImage = { imagePath: string | null; imageWidth: number | null; imageHeight: number | null }

export const noImage: StoredImage = { imagePath: null, imageWidth: null, imageHeight: null }

export async function storeImage(imageUrl: string | null, directory: string): Promise<StoredImage> {
  if (!imageUrl) return noImage
  const resource = await fetchPublicResource(imageUrl, 12 * 1024 * 1024)
  if (!/^image\/(png|x-png|jpeg|jpg|webp|avif|gif)(;|$)/i.test(resource.contentType)) {
    throw new HttpError(422, 'That URL is not a supported image. Use a JPEG, PNG, WebP, AVIF, or GIF image URL, or save without a picture.')
  }
  let result: { data: Buffer; info: OutputInfo }
  try {
    result = await sharp(resource.body, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true })
  } catch (error) {
    console.warn('Image decoding failed:', error instanceof Error ? error.message : 'Unknown image error')
    throw new HttpError(422, 'This image could not be stored. Choose another picture, or clear the image URL to save just the link.')
  }
  const name = `${createHash('sha256').update(result.data).digest('hex')}.webp`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporaryPath = path.join(directory, `${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, result.data, { mode: 0o600 })
    await rename(temporaryPath, path.join(directory, name))
  } finally {
    await rm(temporaryPath, { force: true })
  }
  return { imagePath: `/media/${name}`, imageWidth: result.info.width, imageHeight: result.info.height }
}
