import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, IconButton, Status, TooltipProvider } from '@giulioungaretti/home-design-system'
import { ArrowUpRight, Check, KeyRound, LoaderCircle, Star } from 'lucide-react'
import browser from 'webextension-polyfill'
import { z } from 'zod'
import { apiRequest, errorMessage } from '../shared/api.js'
import { extractPageMetadata } from '../shared/metadata.js'
import { metadataSchema, pinInputSchema, pinSchema, saveResultSchema, sourceName, webUrlSchema, type PageMetadata, type Pin } from '../shared/model.js'
import { Brand } from '../src/components/Brand.js'
import { ProductImage } from '../src/components/PinCard.js'
import { TagInput } from '../src/components/TagInput.js'
import '@giulioungaretti/home-design-system/styles.css'
import '../src/theme.css'
import '../src/styles.css'
import './popup.css'

const boardOrigin = 'http://127.0.0.1:4317'

function Popup() {
  const [phase, setPhase] = useState<'loading' | 'pairing' | 'ready' | 'saved'>('loading')
  const [key, setKey] = useState('')
  const [token, setToken] = useState('')
  const [pins, setPins] = useState<Pin[]>([])
  const [metadata, setMetadata] = useState<PageMetadata | null>(null)
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [favorite, setFavorite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState(false)

  const capture = useCallback(async () => {
    setBusy(true)
    setError('')
    setMetadata(null)
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined || !webUrlSchema.safeParse(tab.url).success ||
          (tab.url && new URL(tab.url).origin === boardOrigin)) {
        throw new Error('Open a product page in Safari, then click My Board again.')
      }
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageMetadata,
      })
      const result = metadataSchema.parse(results[0]?.result)
      setMetadata(result)
      setTitle(result.title)
      setImageUrl(result.images[0] ?? null)
    } catch (error) {
      setError(`Could not read this page. ${errorMessage(error)} If Safari asks, allow access to this website.`)
    } finally {
      setBusy(false)
    }
  }, [])

  const connect = useCallback(async (connectionKey: string) => {
    setBusy(true)
    setError('')
    try {
      const result = await apiRequest(boardOrigin, '/api/pins', z.array(pinSchema), { token: connectionKey.trim() })
      await browser.storage.local.set({ connectionKey: connectionKey.trim() })
      setPins(result)
      setToken(connectionKey.trim())
      setPhase('ready')
      await capture()
    } catch (error) {
      setPhase('pairing')
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }, [capture])

  useEffect(() => {
    const initialize = async () => {
      try {
        const stored = await browser.storage.local.get('connectionKey')
        const parsed = z.object({ connectionKey: z.string().optional() }).parse(stored)
        if (parsed.connectionKey) await connect(parsed.connectionKey)
        else setPhase('pairing')
      } catch (error) {
        setPhase('pairing')
        setError(errorMessage(error))
      }
    }
    void initialize()
  }, [connect])

  const save = async () => {
    if (!metadata) return
    setBusy(true)
    setError('')
    try {
      const input = pinInputSchema.parse({ url: metadata.url, title, imageUrl, tags, favorite, notes: '' })
      const result = await apiRequest(boardOrigin, '/api/pins', saveResultSchema, { token, method: 'POST', body: input })
      setDuplicate(!result.created)
      setPhase('saved')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const openBoard = async () => {
    try { await browser.tabs.create({ url: boardOrigin }) }
    catch (error) { setError(errorMessage(error)) }
  }
  const reconnect = async () => {
    try {
      await browser.storage.local.remove('connectionKey')
      setToken('')
      setKey('')
      setError('')
      setPhase('pairing')
    } catch (error) { setError(errorMessage(error)) }
  }

  const suggestions = [...new Set(pins.flatMap((pin) => pin.tags))].sort()
  return (
    <div className="capture-popup">
      <header className="capture-header">
        <Brand compact />
        <IconButton label="Open my board" onClick={() => { void openBoard() }}><ArrowUpRight size={17} /></IconButton>
      </header>
      {phase === 'loading' ? <div className="capture-loading" role="status"><LoaderCircle className="board-spin" size={24} /><p>Opening your collection…</p></div> :
        phase === 'pairing' ? (
          <form className="capture-pairing" onSubmit={(event) => { event.preventDefault(); void connect(key) }}>
            <span className="capture-pairing-icon"><KeyRound size={26} strokeWidth={1.5} /></span>
            <h1>Your board. A little closer.</h1>
            <p>Copy the connection key from “Save from Safari” in My Board. You only need to do this once.</p>
            <label className="label" htmlFor="extension-key">Connection key</label>
            <input className="field" type="password" id="extension-key" value={key} onChange={(event) => setKey(event.target.value)}
              required autoComplete="off" placeholder="Paste your private key" />
            {error && <p className="board-message board-message--error" role="alert">{error}</p>}
            <Button type="submit" disabled={busy || !key.trim()}>{busy ? 'Connecting…' : 'Connect my board'}</Button>
            <button type="button" className="capture-text-button" onClick={() => { void openBoard() }}>Open My Board <ArrowUpRight size={13} /></button>
          </form>
        ) : phase === 'saved' ? (
          <div className="capture-success">
            <span className="capture-success-check"><Check size={30} strokeWidth={1.5} /></span>
            <h1>{duplicate ? 'Already a good find.' : 'That’s a keeper.'}</h1>
            <p>{duplicate ? 'This link is already on your board. We kept your original notes and tags.' :
              `${imageUrl ? 'Picture' : 'Link'}, name, and tags. Safely saved on this Mac.`}</p>
            <strong>{title}</strong>
            <Button type="button" onClick={() => { void openBoard() }}>Take a look <ArrowUpRight size={15} /></Button>
            {error && <p className="board-message board-message--error" role="alert">{error}</p>}
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void save() }}>
            <div className="capture-body">
              {busy && !metadata && <div className="capture-loading" role="status"><LoaderCircle className="board-spin" size={24} /><p>Finding the good bit…</p></div>}
              {error && <p className="board-message board-message--error" role="alert">{error}</p>}
              {!metadata && !busy && <Button type="button" variant="outline" onClick={() => { void capture() }}>Try reading the page again</Button>}
              {metadata && (
                <>
                  <div className="capture-picture">
                    <ProductImage src={imageUrl} title={title} />
                    <button type="button" className="capture-favorite" aria-label="Keep in favorites" aria-pressed={favorite} onClick={() => setFavorite(!favorite)}>
                      <Star size={17} fill={favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {metadata.images.length > 1 && <div className="board-image-picker">
                    {metadata.images.map((image, index) => <button type="button" key={image} aria-label={`Use image ${index + 1}`}
                      aria-pressed={imageUrl === image} onClick={() => setImageUrl(image)}>
                      <img src={image} alt="" referrerPolicy="no-referrer" />
                    </button>)}
                  </div>}
                  <p className="capture-source">{sourceName(metadata.url)}</p>
                  <label className="label" htmlFor="capture-title">Name</label>
                  <input className="field capture-title" id="capture-title" value={title} required maxLength={240} onChange={(event) => setTitle(event.target.value)} />
                  <TagInput value={tags} onChange={setTags} suggestions={suggestions} />
                  <details className="capture-image-details"><summary>Change the image link</summary>
                    <label className="label" htmlFor="capture-image">Image URL</label>
                    <input className="field" id="capture-image" type="url" value={imageUrl ?? ''} onChange={(event) => setImageUrl(event.target.value || null)} />
                    <p className="helper">Clear it to save without a picture.</p>
                  </details>
                  {metadata.warnings.map((warning) => <p className="helper" key={warning}>{warning}</p>)}
                </>
              )}
            </div>
            <footer className="capture-footer">
              <Button type="submit" disabled={busy || !metadata}>{busy ? <LoaderCircle size={17} className="board-spin" /> : <Check size={17} />}
                {busy ? 'Saving…' : 'Save to my board'}
              </Button>
              <div><Status tone="on">Only on this Mac</Status><button type="button" onClick={() => { void reconnect() }}>Reconnect</button></div>
            </footer>
          </form>
        )}
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('The extension root is missing.')
createRoot(root).render(<TooltipProvider><Popup /></TooltipProvider>)
