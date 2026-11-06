import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { canonicalizeUrl, filterPins, pinInputSchema, type Pin } from '../shared/model.js'

function pin(title: string, overrides: Partial<Pin> = {}): Pin {
  return {
    id: randomUUID(), title, url: 'https://shop.example/item', imageUrl: null, imagePath: null,
    imageWidth: null, imageHeight: null, notes: '', tags: [], favorite: false,
    createdAt: '2026-11-06T08:00:00.000Z', updatedAt: '2026-11-06T08:00:00.000Z', ...overrides,
  }
}

describe('product identity and input', () => {
  it('removes ad tracking without losing product variants', () => {
    expect(canonicalizeUrl('https://shop.example/chair?utm_source=facebook&color=green&fbclid=secret&size=large#details'))
      .toBe('https://shop.example/chair?color=green&size=large')
    expect(canonicalizeUrl('https://shop.example/chair?size=large&color=green'))
      .toBe('https://shop.example/chair?color=green&size=large')
    expect(canonicalizeUrl('https://shop.example/chair?color=red')).not.toBe(canonicalizeUrl('https://shop.example/chair?color=green'))
  })

  it('normalizes tag spelling and rejects dangerous URLs', () => {
    expect(pinInputSchema.parse({ title: ' A chair ', url: 'https://shop.example/chair', tags: ['#Green', ' green ', 'PC   build'] }))
      .toMatchObject({ title: 'A chair', tags: ['green', 'pc build'], imageUrl: null })
    for (const url of ['', 'not a url', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@shop.example']) {
      expect(pinInputSchema.safeParse({ title: 'Chair', url }).success).toBe(false)
    }
  })

  it('accepts a cleared optional image field without throwing during validation', () => {
    expect(pinInputSchema.parse({ title: 'Chair', url: 'https://shop.example/chair', imageUrl: '' }).imageUrl).toBeNull()
    expect(pinInputSchema.safeParse({ title: 'Chair', url: 'https://shop.example/chair', imageUrl: 'not an image URL' }).success).toBe(false)
  })
})

describe('collection filters', () => {
  const pins = [
    pin('Green desk lamp', { notes: 'For the reading corner', tags: ['lighting', 'green'], favorite: true, createdAt: '2026-11-05T08:00:00.000Z' }),
    pin('Green chair', { tags: ['green'], createdAt: '2026-11-04T08:00:00.000Z' }),
    pin('Ceramic vase'),
  ]

  it('combines search words, tags, and the selected collection', () => {
    expect(filterPins(pins, { query: 'reading green', tags: ['green', 'lighting'], collection: 'favorites', sort: 'newest' })
      .map((item) => item.title)).toEqual(['Green desk lamp'])
    expect(filterPins(pins, { query: '', tags: ['green', 'lighting'], collection: 'all', sort: 'newest' })).toHaveLength(1)
    expect(filterPins(pins, { query: 'unmatched', tags: [], collection: 'all', sort: 'newest' })).toEqual([])
  })

  it('sorts without mutating the original collection and distinguishes untagged finds', () => {
    expect(filterPins(pins, { query: '', tags: [], collection: 'all', sort: 'oldest' }).map((item) => item.title))
      .toEqual(['Green chair', 'Green desk lamp', 'Ceramic vase'])
    expect(filterPins(pins, { query: '', tags: [], collection: 'all', sort: 'name' }).map((item) => item.title))
      .toEqual(['Ceramic vase', 'Green chair', 'Green desk lamp'])
    expect(filterPins(pins, { query: '', tags: [], collection: 'untagged', sort: 'newest' }).map((item) => item.title))
      .toEqual(['Ceramic vase'])
    expect(pins[0]?.title).toBe('Green desk lamp')
  })
})
