import type { PageMetadata } from './model.js'

// Keep this function self-contained: WebExtensions serializes it into the active tab.
export function extractPageMetadata(page: Document = document, pageUrl: string = location.href): PageMetadata {
  const warnings: string[] = []
  const text = (value: unknown, length: number): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, length) : ''
  const meta = (selector: string): string => page.querySelector(selector)?.getAttribute('content') ?? ''
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  const absolute = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim() || value.length > 8192) return null
    try {
      const url = new URL(value, pageUrl)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
    } catch {
      return null
    }
  }
  let remainingNodes = 200
  const findProduct = (value: unknown, depth = 0): Record<string, unknown> | null => {
    if (depth > 12 || remainingNodes-- <= 0) return null
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findProduct(item, depth + 1)
        if (found) return found
      }
    } else if (object(value)) {
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
      if (types.some((type) => typeof type === 'string' && /(^|[/#])Product$/.test(type))) return value
      for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
        const found = findProduct(value[key], depth + 1)
        if (found) return found
      }
    }
    return null
  }
  let product: Record<string, unknown> | null = null
  for (const script of page.querySelectorAll('script[type="application/ld+json"]')) {
    if ((script.textContent?.length ?? 0) > 200_000) {
      warnings.push('Some structured page data was too large to read.')
      continue
    }
    try {
      product = findProduct(JSON.parse(script.textContent ?? ''))
      if (product) break
    } catch {
      warnings.push('Some structured page data could not be read; check the preview.')
    }
  }
  const images: string[] = []
  const addImage = (value: unknown, depth = 0): void => {
    if (depth > 6 || images.length >= 12) return
    if (Array.isArray(value)) {
      value.slice(0, 12).forEach((item) => addImage(item, depth + 1))
    } else if (object(value)) {
      addImage(value.contentUrl ?? value.url, depth + 1)
    } else {
      const url = absolute(value)
      if (url && !images.includes(url)) images.push(url)
    }
  }
  addImage(product?.image)
  for (const element of page.querySelectorAll('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], meta[property="twitter:image"], meta[itemprop="image"]')) {
    addImage(element.getAttribute('content'))
  }
  addImage(page.querySelector('link[itemprop="image"]')?.getAttribute('href'))
  for (const image of page.querySelectorAll('img')) {
    const width = image.naturalWidth || Number(image.getAttribute('width'))
    const height = image.naturalHeight || Number(image.getAttribute('height'))
    if (width >= 240 && height >= 180) {
      addImage(image.currentSrc || image.getAttribute('src') || image.getAttribute('data-src'))
    }
  }
  let url = pageUrl
  const canonical = absolute(page.querySelector('link[rel="canonical"]')?.getAttribute('href'))
  if (canonical && new URL(canonical).origin === new URL(pageUrl).origin) url = canonical
  return {
    url,
    title: text(product?.name, 240) || text(meta('meta[property="og:title"]'), 240) ||
      text(page.querySelector('h1')?.textContent, 240) || text(page.title, 240) || new URL(pageUrl).hostname,
    description: text(product?.description, 1000) || text(meta('meta[property="og:description"]'), 1000) ||
      text(meta('meta[name="description"]'), 1000),
    images,
    warnings: [...new Set(warnings)],
  }
}
