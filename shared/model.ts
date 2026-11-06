import { z } from 'zod'

export function canonicalizeUrl(input: string): string {
  const url = new URL(input)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|igshid)$/i.test(key)) {
      url.searchParams.delete(key)
    }
  }
  url.searchParams.sort()
  return url.href
}

export const webUrlSchema = z.string().trim().max(8192).url().refine(
  (value) => {
    try {
      const url = new URL(value)
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
    } catch {
      return false
    }
  },
  'Use an http or https link without a username or password.',
)

export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLowerCase()).filter(Boolean))]
}

export const tagsSchema = z.array(z.string().trim().max(40)).max(20).transform(normalizeTags)

export const pinInputSchema = z.object({
  url: webUrlSchema.transform(canonicalizeUrl),
  title: z.string().trim().min(1, 'Give this find a name.').max(240),
  imageUrl: z.union([webUrlSchema, z.literal(''), z.null()]).default(null).transform((value) => value || null),
  notes: z.string().trim().max(3000).default(''),
  tags: tagsSchema.default([]),
  favorite: z.boolean().default(false),
})

export type PinInput = z.output<typeof pinInputSchema>

export const pinSchema = z.object({
  id: z.string().uuid(),
  url: webUrlSchema,
  title: z.string(),
  imageUrl: webUrlSchema.nullable(),
  imagePath: z.string().regex(/^\/media\/[a-f0-9]{64}\.webp$/).nullable(),
  imageWidth: z.number().positive().nullable(),
  imageHeight: z.number().positive().nullable(),
  notes: z.string(),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Pin = z.infer<typeof pinSchema>

export const metadataSchema = z.object({
  url: webUrlSchema,
  title: z.string().max(240),
  description: z.string().max(1000),
  images: z.array(webUrlSchema).max(12),
  warnings: z.array(z.string()),
})

export type PageMetadata = z.infer<typeof metadataSchema>

export const bootstrapSchema = z.object({
  token: z.string().min(32),
  pins: z.array(pinSchema),
  warnings: z.array(z.string()),
  extensionAvailable: z.boolean(),
})

export const saveResultSchema = z.object({ pin: pinSchema, created: z.boolean() })

export const captureSchema = z.object({
  url: webUrlSchema,
  title: z.string().max(240).default(''),
  imageUrl: z.union([webUrlSchema, z.null()]).default(null),
})

export type Capture = z.infer<typeof captureSchema>
export type SortOrder = 'newest' | 'oldest' | 'name'
export type Collection = 'all' | 'favorites' | 'untagged'

export function sourceName(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

export function filterPins(
  pins: readonly Pin[],
  filters: { query: string; tags: readonly string[]; collection: Collection; sort: SortOrder },
): Pin[] {
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return pins.filter((pin) => {
    if (filters.collection === 'favorites' && !pin.favorite) return false
    if (filters.collection === 'untagged' && pin.tags.length > 0) return false
    if (!filters.tags.every((tag) => pin.tags.includes(tag))) return false
    const haystack = `${pin.title} ${pin.notes} ${pin.url} ${pin.tags.join(' ')}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  }).sort((a, b) => {
    if (filters.sort === 'name') return a.title.localeCompare(b.title)
    const order = a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    return filters.sort === 'oldest' ? order : -order
  })
}
