import { test, expect } from '@playwright/test'
import { bootstrapSchema } from '../../shared/model.js'

test.beforeEach(async ({ request }) => {
  const snapshot = bootstrapSchema.parse(await (await request.get('/api/bootstrap')).json())
  for (const pin of snapshot.pins) {
    await request.delete(`/api/pins/${pin.id}`, { headers: { Authorization: `Bearer ${snapshot.token}` } })
  }
})

test('save, reload, edit, favorite, and remove a find', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add a find', exact: true }).click()
  await page.getByLabel('Product link').fill('https://shop.example/lamp?utm_source=ad')
  await page.getByRole('button', { name: 'Enter details yourself' }).click()
  await page.getByLabel('Name', { exact: true }).fill('A green reading lamp')
  await page.getByLabel('Tags', { exact: true }).fill('lighting')
  await page.getByLabel('Tags', { exact: true }).press('Enter')
  await page.getByLabel('A note to yourself').fill('For the corner by the window.')
  await page.getByRole('button', { name: 'Save to my board' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('pin-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'A green reading lamp' })).toBeVisible()
  await page.getByRole('button', { name: 'Favorite A green reading lamp', exact: true }).click()
  await page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name: /Favorites/ }).click()
  await expect(page.getByTestId('pin-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'View A green reading lamp' }).click()
  await page.getByLabel('A note to yourself').fill('Check the cable length.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Check the cable length.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View A green reading lamp' }).click()
  await page.getByRole('button', { name: 'Remove find', exact: true }).click()
  await page.getByRole('button', { name: 'Remove permanently' }).click()
  await expect(page.getByTestId('pin-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Nothing here. Yet.' })).toBeVisible()
})

test('combines tag filters with search, and clears an empty result', async ({ page, request }) => {
  const { token } = bootstrapSchema.parse(await (await request.get('/api/bootstrap')).json())
  for (const input of [
    { title: 'Green lamp', tags: ['green', 'lighting'] },
    { title: 'Green chair', tags: ['green', 'furniture'] },
    { title: 'Amber pendant', tags: ['lighting'] },
  ]) {
    await request.post('/api/pins', { headers: { Authorization: `Bearer ${token}` }, data: { ...input, url: `https://shop.example/${encodeURIComponent(input.title)}` } })
  }
  await page.goto('/')
  await expect(page.getByTestId('pin-card')).toHaveCount(3)
  const columns = await page.locator('.board-masonry > *').evaluateAll((cards) => [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().x)))])
  expect(columns.length).toBe(3)
  await page.getByRole('button', { name: 'green 2', exact: true }).click()
  await page.getByRole('button', { name: 'lighting 2', exact: true }).click()
  await expect(page.getByTestId('pin-card')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Green lamp', exact: true })).toBeVisible()
  await page.getByLabel('Search your finds').fill('chair')
  await expect(page.getByRole('heading', { name: 'Nothing here. Yet.' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click()
  await expect(page.getByTestId('pin-card')).toHaveCount(3)
  await page.getByLabel('Sort finds').selectOption('name')
  await expect(page.getByTestId('pin-card').first()).toContainText('Amber pendant')
})

test('bookmark capture requires review before persisting', async ({ page, request }) => {
  const capture = { url: 'https://shop.example/case?fbclid=tracking', title: 'A captured case', imageUrl: null }
  await page.goto(`/#capture=${encodeURIComponent(JSON.stringify(capture))}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('A captured case')
  expect(bootstrapSchema.parse(await (await request.get('/api/bootstrap')).json()).pins).toHaveLength(0)
  await page.getByRole('button', { name: 'Save to my board' }).click()
  await expect(page.getByTestId('pin-card')).toHaveCount(1)
  const saved = bootstrapSchema.parse(await (await request.get('/api/bootstrap')).json()).pins[0]
  expect(saved?.url).toBe('https://shop.example/case')
  await expect(page).not.toHaveURL(/capture=/)
})

test('a blocked preview remains editable instead of losing the draft', async ({ page }) => {
  await page.route('**/api/preview', (route) => route.fulfill({
    status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'This shop blocks previews. Enter the details yourself.' }),
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Add a find', exact: true }).click()
  await page.getByLabel('Product link').fill('https://shop.example/blocked')
  await page.getByRole('button', { name: 'Find details', exact: true }).first().click()
  await expect(page.getByRole('alert')).toContainText('This shop blocks previews.')
  await expect(page.getByLabel('Product link')).toHaveValue('https://shop.example/blocked')
  await page.getByLabel('Name', { exact: true }).fill('Manually saved find')
  await page.getByRole('button', { name: 'Save to my board' }).click()
  await expect(page.getByRole('heading', { name: 'Manually saved find' })).toBeVisible()
})

test('mobile navigation and the editor fit at 375 and 320 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Set up Safari quick save', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add a find', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add a find', exact: true })).toBeFocused()
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
