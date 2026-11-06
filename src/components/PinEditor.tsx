import { useState, type FormEvent } from 'react'
import { Button, Switch } from '@giulioungaretti/home-design-system'
import { ArrowUpRight, Check, Link2, LoaderCircle, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { apiRequest, errorMessage } from '../../shared/api.js'
import { metadataSchema, pinInputSchema, pinSchema, saveResultSchema, webUrlSchema, type Capture, type Pin } from '../../shared/model.js'
import { Dialog } from './Dialog.js'
import { ProductImage } from './PinCard.js'
import { TagInput } from './TagInput.js'

export type EditIntent = { kind: 'new'; draft?: Capture } | { kind: 'edit'; pin: Pin }

export function PinEditor({ intent, token, tags: suggestions, onClose, onSaved, onDeleted }: {
  intent: EditIntent
  token: string
  tags: readonly string[]
  onClose: () => void
  onSaved: (pin: Pin, created: boolean) => void
  onDeleted: (id: string) => void
}) {
  const existing = intent.kind === 'edit' ? intent.pin : null
  const initial = existing ?? (intent.kind === 'new' ? intent.draft : undefined)
  const [url, setUrl] = useState(initial?.url ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '')
  const [images, setImages] = useState<string[]>(initial?.imageUrl ? [initial.imageUrl] : [])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [tags, setTags] = useState(existing?.tags ?? [])
  const [favorite, setFavorite] = useState(existing?.favorite ?? false)
  const [details, setDetails] = useState(!!initial?.title)
  const [busy, setBusy] = useState<'preview' | 'save' | 'delete' | null>(null)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const preview = async () => {
    const parsed = webUrlSchema.safeParse(url)
    if (!parsed.success) { setError('Paste a complete product link, starting with https://.'); return }
    setBusy('preview')
    setError('')
    try {
      const metadata = await apiRequest('', '/api/preview', metadataSchema, { token, method: 'POST', body: { url: parsed.data } })
      setUrl(metadata.url)
      setTitle(metadata.title)
      setImages(metadata.images)
      setImageUrl(metadata.images[0] ?? '')
      setWarnings(metadata.warnings)
      setDetails(true)
    } catch (error) {
      setError(errorMessage(error))
      setDetails(true)
    } finally {
      setBusy(null)
    }
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!details) { await preview(); return }
    const parsed = pinInputSchema.safeParse({ url, title, imageUrl, notes, tags, favorite })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Please check the fields.'); return }
    setBusy('save')
    setError('')
    try {
      if (existing) {
        const pin = await apiRequest('', `/api/pins/${existing.id}`, pinSchema, { token, method: 'PUT', body: parsed.data })
        onSaved(pin, false)
      } else {
        const result = await apiRequest('', '/api/pins', saveResultSchema, { token, method: 'POST', body: parsed.data })
        onSaved(result.pin, result.created)
      }
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!existing) return
    setBusy('delete')
    setError('')
    try {
      await apiRequest('', `/api/pins/${existing.id}`, z.undefined(), { token, method: 'DELETE' })
      onDeleted(existing.id)
    } catch (error) {
      setError(errorMessage(error))
      setBusy(null)
    }
  }

  const previewImage = existing && imageUrl === existing.imageUrl ? existing.imagePath : imageUrl || null
  return (
    <Dialog title={existing ? 'A closer look.' : 'Keep a good find.'} onClose={onClose} preventClose={!!busy}>
      <form className="board-editor" onSubmit={(event) => { void save(event) }}>
        <div className="board-dialog-body">
          <p className="board-editor-intro">{existing ? 'A little more about something you liked.' : 'The picture, the name, the reason you liked it. All in one place.'}</p>
          <div className="board-field-group">
            <label className="label" htmlFor="product-url">Product link</label>
            <div className="board-url-row">
              <div className="board-url-input">
                <Link2 size={17} />
                <input className="field" id="product-url" type="url" required maxLength={8192} value={url}
                  data-autofocus={!existing && !initial?.title ? true : undefined} placeholder="https://something-you-love.com"
                  onChange={(event) => setUrl(event.target.value)} disabled={!!busy} />
              </div>
              {!existing && <Button variant="outline" type="button" disabled={!!busy || !url.trim()} onClick={() => { void preview() }}>
                {busy === 'preview' ? <LoaderCircle className="board-spin" size={17} /> : 'Find details'}
              </Button>}
            </div>
          </div>
          {error && <p className="board-message board-message--error" role="alert">{error}</p>}
          {warnings.map((warning) => <p className="board-message" key={warning}>{warning}</p>)}
          {!details && (
            <div className="board-manual-entry">
              <span>Some websites prefer to keep their details to themselves.</span>
              <button type="button" onClick={() => { setDetails(true); setError('') }}>Enter details yourself <ArrowUpRight size={13} /></button>
            </div>
          )}
          {details && (
            <div className="board-editor-details">
              <div className="board-editor-image">
                <ProductImage src={previewImage} title={title || 'Product preview'} />
                {images.length > 1 && (
                  <div className="board-image-picker" aria-label="Choose a product image">
                    {images.map((image, index) => (
                      <button type="button" key={image} onClick={() => setImageUrl(image)}
                        aria-label={`Use image ${index + 1}`} aria-pressed={imageUrl === image}>
                        <img src={image} alt="" referrerPolicy="no-referrer" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="board-field-group">
                <label className="label" htmlFor="product-title">Name</label>
                <input className="field" id="product-title" required maxLength={240} value={title} data-autofocus={initial?.title ? true : undefined}
                  onChange={(event) => setTitle(event.target.value)} placeholder="Give your find a name" />
              </div>
              <div className="board-field-group">
                <label className="label" htmlFor="product-image">Image link <span className="board-optional">optional</span></label>
                <input className="field" id="product-image" type="url" maxLength={8192} value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…/picture.jpg" aria-describedby="image-help" />
                <p className="helper" id="image-help">We keep a copy on this Mac, not just a link to the picture.</p>
              </div>
              <TagInput value={tags} onChange={setTags} suggestions={suggestions} />
              <div className="board-field-group">
                <label className="label" htmlFor="product-notes">A note to yourself <span className="board-optional">optional</span></label>
                <textarea className="field board-notes" id="product-notes" rows={3} maxLength={3000} value={notes}
                  onChange={(event) => setNotes(event.target.value)} placeholder="What caught your eye?" />
              </div>
              <div className="board-switch-row">
                <div><label htmlFor="product-favorite">Keep in favorites</label><p>The finds you keep coming back to.</p></div>
                <Switch id="product-favorite" checked={favorite} onCheckedChange={setFavorite} />
              </div>
              {existing && <a className="board-visit" href={existing.url} target="_blank" rel="noreferrer">Visit original page <ArrowUpRight size={16} /></a>}
            </div>
          )}
        </div>
        <footer className="board-dialog-footer">
          {existing && !confirmDelete && <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setConfirmDelete(true)} aria-label="Remove find">
            <Trash2 size={16} /><span className="board-delete-label">Remove</span>
          </Button>}
          {confirmDelete ? (
            <div className="board-delete-confirm">
              <p>Remove this find from your board?</p>
              <Button type="button" variant="outline" disabled={!!busy} onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button type="button" variant="destructive" disabled={!!busy} onClick={() => { void remove() }}>
                {busy === 'delete' ? 'Removing…' : 'Remove permanently'}
              </Button>
            </div>
          ) : (
            <div className="board-save-actions">
              <Button type="button" variant="outline" disabled={!!busy} onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={!!busy}>
                {busy ? <LoaderCircle size={17} className="board-spin" /> : details ? <Check size={17} /> : <Link2 size={17} />}
                {busy === 'save' ? 'Saving…' : busy === 'preview' ? 'Finding details…' : existing ? 'Save changes' : details ? 'Save to my board' : 'Find details'}
              </Button>
            </div>
          )}
        </footer>
      </form>
    </Dialog>
  )
}
