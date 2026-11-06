import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { pinSchema, type Pin, type PinInput } from '../shared/model.js'
import { HttpError } from './errors.js'
import type { StoredImage } from './images.js'

export function createStore(filename: string) {
  const database = new DatabaseSync(filename)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS pins (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      document TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  const decode = (row: unknown): Pin | null => {
    if (!row) return null
    const { document } = z.object({ document: z.string() }).parse(row)
    return pinSchema.parse(JSON.parse(document))
  }
  const get = (id: string): Pin | null => decode(database.prepare('SELECT document FROM pins WHERE id = ?').get(id))
  const byUrl = (url: string): Pin | null => decode(database.prepare('SELECT document FROM pins WHERE url = ?').get(url))
  return {
    list: (): Pin[] => database.prepare('SELECT document FROM pins ORDER BY rowid DESC').all()
      .map((row) => pinSchema.parse(JSON.parse(z.object({ document: z.string() }).parse(row).document))),
    get,
    byUrl,
    create(input: PinInput, image: StoredImage): { pin: Pin; created: boolean } {
      const now = new Date().toISOString()
      const pin: Pin = {
        ...input, imagePath: image.imagePath, imageWidth: image.imageWidth, imageHeight: image.imageHeight,
        id: randomUUID(), createdAt: now, updatedAt: now,
      }
      const result = database.prepare('INSERT OR IGNORE INTO pins (id, url, document) VALUES (?, ?, ?)')
        .run(pin.id, pin.url, JSON.stringify(pin))
      const saved = byUrl(pin.url)
      if (!saved) throw new Error('The saved product could not be read back.')
      return { pin: saved, created: result.changes === 1 }
    },
    update(id: string, input: PinInput, image: StoredImage): Pin {
      const existing = get(id)
      if (!existing) throw new HttpError(404, 'This find no longer exists. Refresh your board.')
      const duplicate = byUrl(input.url)
      if (duplicate && duplicate.id !== id) throw new HttpError(409, 'That link is already on your board.')
      const pin: Pin = {
        ...existing, ...input, imagePath: image.imagePath, imageWidth: image.imageWidth, imageHeight: image.imageHeight,
        updatedAt: new Date().toISOString(),
      }
      database.prepare('UPDATE pins SET url = ?, document = ? WHERE id = ?').run(pin.url, JSON.stringify(pin), id)
      return pin
    },
    remove(id: string): void {
      const result = database.prepare('DELETE FROM pins WHERE id = ?').run(id)
      if (result.changes === 0) throw new HttpError(404, 'This find was already removed.')
    },
    setting(key: string): string | null {
      const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return row ? z.object({ value: z.string() }).parse(row).value : null
    },
    setSetting(key: string, value: string): void {
      database.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
    },
    close: () => database.close(),
  }
}

export type Store = ReturnType<typeof createStore>
