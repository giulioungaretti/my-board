import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (!existsSync('dist-extension/manifest.json')) {
  console.error('Build the WebExtension first: npm run build')
  process.exit(1)
}

const tools = ['safari-web-extension-packager', 'safari-web-extension-converter']
const tool = tools.find((name) => spawnSync('xcrun', ['--find', name], { stdio: 'ignore' }).status === 0)
if (!tool) {
  console.error('Full Xcode is required to package a native Safari extension. The standalone Command Line Tools do not include the packager. Install Xcode, select it as the active developer directory, then run this command again. The bookmark shortcut works without Xcode.')
  process.exit(1)
}

execFileSync('xcrun', [
  tool, 'dist-extension',
  '--project-location', 'build/safari',
  '--app-name', 'My Board',
  '--bundle-identifier', 'com.giulioungaretti.myboard',
  '--macos-only', '--swift', '--no-open', '--no-prompt',
], { stdio: 'inherit' })
