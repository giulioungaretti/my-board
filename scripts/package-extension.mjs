import { execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const extensionDirectory = path.join(root, 'dist-extension')
await mkdir(path.join(extensionDirectory, 'icons'), { recursive: true })
for (const size of [16, 32, 48, 128]) {
  await sharp(path.join(root, 'public/icon.svg')).resize(size, size)
    .png().toFile(path.join(extensionDirectory, 'icons', `${size}.png`))
}
const downloadDirectory = path.join(root, 'dist/downloads')
await mkdir(downloadDirectory, { recursive: true })
const archive = path.join(downloadDirectory, 'my-board-extension.zip')
await rm(archive, { force: true })
execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: extensionDirectory, stdio: 'inherit' })
console.log('Safari-ready WebExtension: dist/downloads/my-board-extension.zip')
