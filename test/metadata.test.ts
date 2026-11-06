import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { extractPageMetadata } from '../shared/metadata.js'

const url = 'https://shop.example/products/chair?color=green'
const read = (html: string) => extractPageMetadata(parseHTML(html).document, url)

describe('page capture', () => {
  it('prefers Product JSON-LD in a graph, including image objects and variants', () => {
    const result = read(`<html><head><title>Shop</title><script type="application/ld+json">{
      "@graph":[{"@type":"Organization","name":"Not the product"},
      {"@type":["Thing","Product"],"name":"Green chair","description":"Oak & wool",
      "image":[{"contentUrl":"/chair.jpg"},"//cdn.example/chair-side.webp"]}]
    }</script><meta property="og:image" content="/social.jpg"></head></html>`)
    expect(result.title).toBe('Green chair')
    expect(result.description).toBe('Oak & wool')
    expect(result.images).toEqual(['https://shop.example/chair.jpg', 'https://cdn.example/chair-side.webp', 'https://shop.example/social.jpg'])
  })

  it('falls back visibly after malformed JSON-LD and decodes HTML metadata', () => {
    const result = read(`<html><head><script type="application/ld+json">{bad</script>
      <meta property="og:title" content="Lamp &amp; shade"><meta name="twitter:image" content="/lamp.png">
      <link rel="canonical" href="https://attacker.example/not-the-product"></head></html>`)
    expect(result.title).toBe('Lamp & shade')
    expect(result.images).toEqual(['https://shop.example/lamp.png'])
    expect(result.url).toBe(url)
    expect(result.warnings).toHaveLength(1)
  })

  it('rejects executable image URLs and picks large page images instead of icons', () => {
    const result = read(`<html><head><title>A good object</title><meta property="og:image" content="javascript:alert(1)"></head>
      <body><img src="/icon.png" width="16" height="16"><img src="/object.jpg" width="800" height="600">
      <img src="/object.jpg" width="800" height="600"></body></html>`)
    expect(result.images).toEqual(['https://shop.example/object.jpg'])
  })

  it('survives serialization into an isolated extension tab without imported helpers', () => {
    const { document } = parseHTML('<html><head><title>Captured from Safari</title></head></html>')
    const execute = new Function('document', 'location', `return (${extractPageMetadata.toString()})()`) as
      (document: Document, location: { href: string }) => ReturnType<typeof extractPageMetadata>
    expect(execute(document, { href: url }).title).toBe('Captured from Safari')
  })

  it('bounds very large structured data and still returns an editable preview', () => {
    const result = read(`<html><head><title>Fallback title</title><script type="application/ld+json">${' '.repeat(200_001)}</script></head></html>`)
    expect(result.title).toBe('Fallback title')
    expect(result.warnings).toContain('Some structured page data was too large to read.')
  })
})
