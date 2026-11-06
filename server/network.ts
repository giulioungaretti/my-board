import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage } from 'node:http'
import ipaddr from 'ipaddr.js'
import { webUrlSchema } from '../shared/model.js'
import { HttpError } from './errors.js'

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false
  const parsed = ipaddr.process(address)
  return parsed.range() === 'unicast'
}

export function validateRemoteUrl(input: string): URL {
  const parsed = webUrlSchema.safeParse(input)
  if (!parsed.success) throw new HttpError(400, 'Use a valid public http or https URL.')
  const url = new URL(parsed.data)
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new HttpError(400, 'Only standard web ports are supported.')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      (ipaddr.isValid(hostname) && !isPublicAddress(hostname))) {
    throw new HttpError(400, 'Private and local network addresses cannot be fetched.')
  }
  return url
}

export type RemoteResource = { body: Buffer; contentType: string; url: string }

export async function fetchPublicResource(input: string, maximumBytes: number): Promise<RemoteResource> {
  const signal = AbortSignal.timeout(20_000)
  let url = validateRemoteUrl(input)
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      signal.throwIfAborted()
      const hostname = url.hostname.replace(/^\[|\]$/g, '')
      const addresses = await lookup(hostname, { all: true })
      signal.throwIfAborted()
      const address = addresses[0]
      if (!address || addresses.some((entry) => !isPublicAddress(entry.address))) {
        throw new HttpError(400, 'Private and local network addresses cannot be fetched.')
      }
      // Connect to the validated IP, retaining the original Host and TLS name.
      // Resolving again during the connection would allow DNS rebinding.
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const options = {
          hostname: address.address,
          family: address.family,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          signal,
          headers: {
            Host: url.host,
            Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.9,*/*;q=0.5',
            'Accept-Encoding': 'identity',
            'User-Agent': 'MyBoard/0.1 (personal product bookmark)',
          },
        }
        const request = url.protocol === 'https:'
          ? httpsRequest({ ...options, servername: hostname }, resolve)
          : httpRequest(options, resolve)
        request.on('error', reject)
        request.end()
      })
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const location = response.headers.location
        response.destroy()
        if (!location || redirects === 4) throw new HttpError(422, 'This page redirected too many times.')
        url = validateRemoteUrl(new URL(location, url).href)
        continue
      }
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy()
        throw new HttpError(422, 'This website blocked the request or is unavailable. Try the Safari extension, or enter the details yourself.')
      }
      if (Number(response.headers['content-length']) > maximumBytes) {
        response.destroy()
        throw new HttpError(413, 'This resource is too large to save.')
      }
      let length = 0
      const chunks: Buffer[] = []
      for await (const chunk of response) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        length += bytes.length
        if (length > maximumBytes) {
          response.destroy()
          throw new HttpError(413, 'This resource is too large to save.')
        }
        chunks.push(bytes)
      }
      return {
        body: Buffer.concat(chunks),
        contentType: response.headers['content-type'] ?? '',
        url: url.href,
      }
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    console.warn('Remote resource request failed:', error instanceof Error ? error.message : 'Unknown network error')
    throw new HttpError(422, 'The website did not respond. Try the Safari extension, or enter the details yourself.')
  }
  throw new HttpError(422, 'Unable to follow this page.')
}
