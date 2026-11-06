import { describe, expect, it, vi } from 'vitest'
import { fetchPublicResource, isPublicAddress, validateRemoteUrl } from '../server/network.js'

const mockLookup = vi.hoisted(() => vi.fn<() => Promise<{ address: string; family: number }[]>>())
vi.mock('node:dns/promises', () => ({ lookup: mockLookup }))

describe('safe product fetching', () => {
  it('rejects loopback, private, mapped, and special-use addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:192.168.0.1']) {
      expect(isPublicAddress(address), address).toBe(false)
    }
    expect(isPublicAddress('1.1.1.1')).toBe(true)
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('rejects local hostnames, credentials, non-web protocols, and arbitrary ports', () => {
    for (const url of ['http://localhost', 'http://router.local', 'http://service.internal', 'http://127.1',
      'http://2130706433', 'http://[::1]', 'file:///tmp/file', 'https://user:secret@example.com', 'http://example.com:3000']) {
      expect(() => validateRemoteUrl(url), url).toThrow()
    }
    expect(validateRemoteUrl('https://shop.example/product').hostname).toBe('shop.example')
  })

  it('rejects a public hostname resolving to a private IP before connecting', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
    await expect(fetchPublicResource('https://shop.example/product', 1024)).rejects.toThrow('Private and local')
  })

  it('rejects mixed public/private DNS answers rather than choosing the public entry', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }, { address: '192.168.1.1', family: 4 }])
    await expect(fetchPublicResource('https://shop.example/product', 1024)).rejects.toThrow('Private and local')
  })
})
