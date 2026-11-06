import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { bootstrapSchema } from '../../shared/model.js'

test('the built popup pairs, captures a product, and persists it through the real API', async ({ page, request }) => {
  const initial = bootstrapSchema.parse(await (await request.get('/api/bootstrap')).json())
  const extensionDirectory = path.resolve('dist-extension')
  const cors = {
    'Access-Control-Allow-Origin': 'http://extension.test',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
  await page.route('http://extension.test/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const filename = path.resolve(extensionDirectory, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!filename.startsWith(`${extensionDirectory}${path.sep}`)) throw new Error('Invalid fixture asset path')
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }
    await route.fulfill({ body: await readFile(filename), contentType: types[path.extname(filename)] ?? 'application/octet-stream' })
  })
  await page.route('http://127.0.0.1:4317/api/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    const url = new URL(route.request().url())
    const response = await request.fetch(`${url.pathname}${url.search}`, {
      method: route.request().method(),
      headers: {
        Authorization: route.request().headers().authorization ?? '',
        'Content-Type': 'application/json',
        Origin: 'safari-web-extension://popup-fixture',
      },
      ...(route.request().postData() ? { data: route.request().postData() } : {}),
    })
    await route.fulfill({ response, headers: { ...response.headers(), ...cors } })
  })
  // The browser APIs are a harness; the shipped popup, extractor, and local API are real.
  await page.addInitScript(() => {
    const storage: Record<string, unknown> = {}
    Object.defineProperty(window, 'chrome', { value: { runtime: { id: 'my-board-popup-test' } } })
    Object.defineProperty(window, 'browser', { value: {
      runtime: { id: 'my-board-popup-test' },
      storage: { local: {
        get: async () => storage,
        set: async (value: Record<string, unknown>) => { Object.assign(storage, value) },
        remove: async (key: string) => { delete storage[key] },
      } },
      tabs: {
        query: async () => [{ id: 1, url: 'https://shop.example/extension-find?utm_source=safari' }],
        create: async () => ({ id: 2 }),
      },
      scripting: {
        executeScript: async ({ func }: { func: (page: Document, url: string) => unknown }) => {
          const document = new DOMParser().parseFromString(`<html><head>
            <script type="application/ld+json">{"@type":"Product","name":"The Safari quick-save find"}</script>
            </head><body><h1>Fallback name</h1></body></html>`, 'text/html')
          return [{ result: func(document, 'https://shop.example/extension-find?utm_source=safari') }]
        },
      },
    } })
  })
  await page.goto('http://extension.test/')
  await page.getByLabel('Connection key', { exact: true }).fill(initial.token)
  await page.getByRole('button', { name: 'Connect my board', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('The Safari quick-save find')
  await page.getByLabel('Tags', { exact: true }).fill('quick save')
  await page.getByLabel('Tags', { exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Save to my board', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'That’s a keeper.' })).toBeVisible()
  const snapshot = bootstrapSchema.parse(await (await request.get('/api/bootstrap')).json())
  const saved = snapshot.pins.find((pin) => pin.url === 'https://shop.example/extension-find')
  expect(saved).toMatchObject({ title: 'The Safari quick-save find', tags: ['quick save'], imagePath: null })
  if (saved) await request.delete(`/api/pins/${saved.id}`, { headers: { Authorization: `Bearer ${initial.token}` } })
})
