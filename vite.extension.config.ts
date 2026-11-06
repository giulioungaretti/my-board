import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'extension',
  base: './',
  plugins: [react()],
  build: {
    target: 'safari17',
    outDir: '../dist-extension',
    emptyOutDir: true,
    modulePreload: false,
  },
})
