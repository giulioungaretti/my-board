import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Button, IconButton, Status } from '@giulioungaretti/home-design-system'
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, Compass, Grid2X2, Grid3X3, LayoutGrid, LoaderCircle, Plus, Search, Star, Tag, X } from 'lucide-react'
import { z } from 'zod'
import { apiRequest, errorMessage } from '../shared/api.js'
import { bootstrapSchema, captureSchema, filterPins, pinSchema, type Capture, type Collection, type Pin, type SortOrder } from '../shared/model.js'
import { Brand } from './components/Brand.js'
import { PinCard } from './components/PinCard.js'
import { PinEditor, type EditIntent } from './components/PinEditor.js'
import { Settings } from './components/Settings.js'
import { Masonry } from './components/Masonry.js'

function readCapture(): { draft?: Capture; error?: string } {
  const raw = new URLSearchParams(window.location.hash.slice(1)).get('capture')
  if (!raw) return {}
  try {
    if (raw.length > 20_000) throw new Error('The captured page contains too much data.')
    return { draft: captureSchema.parse(JSON.parse(raw)) }
  } catch {
    return { error: 'That quick-save link is invalid. Use Add a find to save the product manually.' }
  }
}

export function App() {
  const [capture] = useState(readCapture)
  const [pins, setPins] = useState<Pin[]>([])
  const [token, setToken] = useState('')
  const [extensionAvailable, setExtensionAvailable] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState(capture.error ?? '')
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState<Collection>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sort, setSort] = useState<SortOrder>('newest')
  const [compact, setCompact] = useState(false)
  const [editor, setEditor] = useState<EditIntent | null>(capture.draft ? { kind: 'new', draft: capture.draft } : null)
  const [settings, setSettings] = useState(false)
  const [toast, setToast] = useState('')
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await apiRequest('', '/api/bootstrap', bootstrapSchema, { signal })
      setPins(result.pins)
      setToken(result.token)
      setExtensionAvailable(result.extensionAvailable)
      setWarnings(result.warnings)
      setLoaded(true)
      setLoadError('')
    } catch (error) {
      if (!signal?.aborted) setLoadError(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const refresh = () => { if (document.visibilityState === 'visible') void load(controller.signal) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  useEffect(() => {
    if (window.location.hash.includes('capture=')) history.replaceState(null, '', window.location.pathname + window.location.search)
    const handleCapture = () => {
      const next = readCapture()
      if (next.draft) setEditor({ kind: 'new', draft: next.draft })
      if (next.error) setError(next.error)
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    window.addEventListener('hashchange', handleCapture)
    return () => window.removeEventListener('hashchange', handleCapture)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 4500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key === '/' && !editor && !settings && target instanceof HTMLElement &&
          !target.matches('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editor, settings])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    pins.forEach((pin) => pin.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts].sort(([a], [b]) => a.localeCompare(b))
  }, [pins])
  const tagNames = allTags.map(([tag]) => tag)
  const visible = useMemo(() => filterPins(pins, { query, tags: selectedTags, collection, sort }), [pins, query, selectedTags, collection, sort])
  const favorites = pins.filter((pin) => pin.favorite).length
  const untagged = pins.filter((pin) => !pin.tags.length).length
  const filtered = !!query.trim() || selectedTags.length > 0 || collection !== 'all'
  const heading = collection === 'favorites' ? 'Favorites' : collection === 'untagged' ? 'Untagged finds' : 'All finds'
  const subtitle = collection === 'favorites' ? 'The ones you keep coming back to.' :
    collection === 'untagged' ? 'A little organizing, whenever you feel like it.' : 'Good things, kept close.'

  const resetFilters = () => { setQuery(''); setSelectedTags([]); setCollection('all') }
  const openNewFind = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus()
    setEditor({ kind: 'new' })
  }
  const openSettings = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus()
    setSettings(true)
  }
  const selectCollection = (next: Collection) => { setCollection(next); setSelectedTags([]) }
  const toggleTag = (tag: string) => setSelectedTags((previous) => previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag])
  const saved = (pin: Pin, created: boolean) => {
    const wasEditing = editor?.kind === 'edit'
    setPins((previous) => [pin, ...previous.filter((item) => item.id !== pin.id)])
    setEditor(null)
    setToast(wasEditing ? 'Changes saved.' : created ? 'A good find, safely kept.' : 'Already on your board. No duplicates.')
    if (created) resetFilters()
  }
  const toggleFavorite = async (pin: Pin) => {
    setPending((previous) => new Set([...previous, pin.id]))
    try {
      const updated = await apiRequest('', `/api/pins/${pin.id}`, pinSchema, { token, method: 'PATCH', body: { favorite: !pin.favorite } })
      setPins((previous) => previous.map((item) => item.id === updated.id ? updated : item))
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setPending((previous) => new Set([...previous].filter((id) => id !== pin.id)))
    }
  }
  const exportLinks = async () => {
    setExporting(true)
    try {
      const data = await apiRequest('', '/api/export', z.object({ version: z.literal(1), exportedAt: z.string(), pins: z.array(pinSchema) }), { token })
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `my-board-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setToast('Your links and notes are exported. Image files remain on this Mac.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="board-app">
      <a className="skip-link" href="#collection">Skip to collection</a>
      <aside className="board-rail" aria-label="Collection navigation">
        <a className="board-home" href="/" aria-label="My Board home"><Brand /></a>
        <p className="board-rail-description">A home for your good finds.</p>
        <nav className="board-nav" aria-label="Collections">
          <button type="button" className="board-nav-item" aria-current={collection === 'all' ? 'page' : undefined}
            onClick={() => selectCollection('all')}><LayoutGrid size={18} /><span>All finds</span><span className="board-nav-count">{pins.length}</span></button>
          <button type="button" className="board-nav-item" aria-current={collection === 'favorites' ? 'page' : undefined}
            onClick={() => selectCollection('favorites')}><Star size={18} /><span>Favorites</span><span className="board-nav-count">{favorites}</span></button>
          <button type="button" className="board-nav-item" aria-current={collection === 'untagged' ? 'page' : undefined}
            onClick={() => selectCollection('untagged')}><Tag size={18} /><span>Untagged</span><span className="board-nav-count">{untagged}</span></button>
        </nav>
        <div className="board-rail-tags">
          <div className="board-rail-section-title"><h2>Your tags</h2><span>{allTags.length}</span></div>
          {allTags.length ? (
            <div className="board-tag-list">
              {allTags.map(([tag, count]) => (
                <button className="board-tag-nav" type="button" key={tag} aria-pressed={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>
                  <span className="board-tag-indicator" aria-hidden="true">{selectedTags.includes(tag) ? <Check size={10} /> : null}</span>
                  <span>{tag}</span><span className="board-nav-count">{count}</span>
                </button>
              ))}
            </div>
          ) : <p className="board-quiet">Add a tag to a find.<br />It will feel at home here.</p>}
        </div>
        <div className="board-rail-bottom">
          <button type="button" className="board-extension-prompt" disabled={!token} onClick={openSettings}>
            <span className="board-compass"><Compass size={24} strokeWidth={1.4} /></span>
            <span><strong>Save from Safari</strong><span>A good find. One click.</span></span><ArrowRight size={16} />
          </button>
          <button type="button" className="board-export" disabled={!token || exporting} onClick={() => { void exportLinks() }}>
            <ArrowDownToLine size={15} />{exporting ? 'Exporting…' : 'Export links & notes'}
          </button>
          <div className="board-local-status"><Status tone={loaded && !loadError ? 'on' : loadError ? 'alert' : 'off'}>{loadError ? 'Connection interrupted' : 'Stored on this Mac'}</Status><span>No account. Just yours.</span></div>
        </div>
      </aside>

      <main className="board-main" id="collection">
        <header className="board-topbar">
          <div className="board-search">
            <Search size={18} aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="Search your finds" placeholder="Search your finds" value={query}
              onChange={(event) => setQuery(event.target.value)} />
            {!query && <kbd aria-hidden="true">/</kbd>}
          </div>
          <Button type="button" onClick={openNewFind} disabled={!token} className="board-add-button"><Plus size={18} />Add a find</Button>
        </header>

        <section className="board-collection-heading" aria-labelledby="collection-title">
          <div><h1 id="collection-title">{heading}<span>.</span></h1><p>{subtitle}</p></div>
          <div className="board-collection-count"><span>{pins.length.toString().padStart(2, '0')}</span><span>{pins.length === 1 ? 'saved find' : 'saved finds'}</span></div>
        </section>

        <div className="board-toolbar">
          <div className="board-filter-summary">
            <span className="board-result-count" aria-live="polite">{loaded ? `${visible.length} ${visible.length === 1 ? 'find' : 'finds'}` : 'Opening your board…'}</span>
            {selectedTags.map((tag) => <button className="board-filter-tag" type="button" key={tag} onClick={() => toggleTag(tag)} aria-label={`Clear filter ${tag}`}>{tag}<X size={12} /></button>)}
            {filtered && <button className="board-clear-filters" type="button" onClick={resetFilters}>Clear filters</button>}
          </div>
          <div className="board-view-controls">
            <div className="board-sort"><select aria-label="Sort finds" value={sort} onChange={(event) => setSort(event.target.value as SortOrder)}>
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option>
            </select><ChevronDown size={13} /></div>
            <div className="board-density" aria-label="Board density">
              <button type="button" aria-label="Comfortable layout" aria-pressed={!compact} onClick={() => setCompact(false)}><Grid2X2 size={16} /></button>
              <button type="button" aria-label="Compact layout" aria-pressed={compact} onClick={() => setCompact(true)}><Grid3X3 size={16} /></button>
            </div>
          </div>
        </div>
        {selectedTags.length > 1 && <p className="board-match-help">Showing finds with all selected tags.</p>}
        {loadError && <div className="board-message board-message--error" role="alert"><p>{loadError}</p><Button type="button" variant="outline" onClick={() => { void load() }}>Reconnect</Button></div>}
        {error && <div className="board-message board-message--error" role="alert"><p>{error}</p><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {warnings.map((warning) => <div className="board-message board-message--error" role="alert" key={warning}>{warning}</div>)}

        {!loaded && !loadError ? (
          <div className="board-loading" role="status"><LoaderCircle className="board-spin" size={24} /><p>Making room for your good finds.</p></div>
        ) : loaded && visible.length === 0 ? (
          <div className="board-empty">
            <span className="board-empty-mark"><Brand compact /></span>
            <h2>{filtered ? 'Nothing here. Yet.' : 'One good find is all it takes.'}</h2>
            <p>{filtered ? 'Try another search or give your filters a little room.' : 'A product, a picture, a thing you like. Save the first one and make this space yours.'}</p>
            <Button type="button" variant={filtered ? 'outline' : 'default'} onClick={filtered ? resetFilters : openNewFind}>
              {filtered ? 'Clear filters' : <><Plus size={17} />Save your first find</>}
            </Button>
          </div>
        ) : (
          <Masonry compact={compact}>
            {visible.map((pin) => <PinCard key={pin.id} pin={pin} pending={pending.has(pin.id)}
              onOpen={() => setEditor({ kind: 'edit', pin })} onFavorite={() => { void toggleFavorite(pin) }}
              onTag={(tag) => { setCollection('all'); setSelectedTags([tag]) }} />)}
            {!filtered && loaded && (
              <button type="button" className={`board-next-find${pins.length < 3 ? ' board-next-find--welcome' : ''}`}
                onClick={openNewFind}>
                <span className="board-next-plus"><Plus size={24} strokeWidth={1.25} /></span>
                <span className="board-next-title">Leave room for<br />a little discovery.</span>
                <span className="board-next-copy">Your next good find goes here.</span>
                <span className="board-next-action">Save something <ArrowRight size={15} /></span>
              </button>
            )}
          </Masonry>
        )}
        {loaded && visible.length > 0 && <footer className="board-endnote"><span className="board-end-line" /><span>You have good taste. Keep going.</span><span className="board-end-line" /></footer>}
      </main>
      <div className={`board-toast${toast ? ' board-toast--visible' : ''}`} role="status" aria-live="polite">{toast && <><Check size={16} /><span>{toast}</span></>}</div>
      {editor && token && <PinEditor intent={editor} token={token} tags={tagNames} onClose={() => setEditor(null)} onSaved={saved}
        onDeleted={(id) => { setPins((previous) => previous.filter((pin) => pin.id !== id)); setEditor(null); setToast('Find removed. A little room for something new.') }} />}
      {settings && <Settings token={token} extensionAvailable={extensionAvailable} onClose={() => setSettings(false)} />}
      <div className="board-mobile-safari"><IconButton label="Set up Safari quick save" onClick={openSettings} disabled={!token}><Compass size={19} /></IconButton></div>
    </div>
  )
}
