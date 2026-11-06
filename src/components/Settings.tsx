import { useState } from 'react'
import { Button, Status } from '@giulioungaretti/home-design-system'
import { Check, Copy, Download, Bookmark, Compass, ArrowUpRight } from 'lucide-react'
import { errorMessage } from '../../shared/api.js'
import { extractPageMetadata } from '../../shared/metadata.js'
import { Dialog } from './Dialog.js'

export function Settings({ token, extensionAvailable, onClose }: {
  token: string
  extensionAvailable: boolean
  onClose: () => void
}) {
  const [copied, setCopied] = useState<'key' | 'bookmarklet' | null>(null)
  const [error, setError] = useState('')
  const origin = window.location.origin
  const copy = async (kind: 'key' | 'bookmarklet') => {
    setError('')
    try {
      const bookmarklet = `javascript:(()=>{const m=(${extractPageMetadata.toString()})();window.open(${JSON.stringify(origin)}+'/#capture='+encodeURIComponent(JSON.stringify({url:m.url,title:m.title,imageUrl:m.images[0]||null})),'_blank','noopener,noreferrer')})()`
      await navigator.clipboard.writeText(kind === 'key' ? token : bookmarklet)
      setCopied(kind)
    } catch (error) {
      setError(`Clipboard access failed. ${errorMessage(error)}`)
    }
  }
  return (
    <Dialog title="Less copying. More collecting." onClose={onClose} className="board-settings-dialog">
      <div className="board-dialog-body board-settings">
        <div className="board-settings-lead">
          <span className="board-settings-icon"><Compass size={30} strokeWidth={1.25} /></span>
          <div><h3>My Board for Safari</h3><p>See something you like? Save its picture and name without leaving the page.</p></div>
        </div>
        <Status tone="on">Local board ready</Status>
        <section className="board-settings-section">
          <h3>Install the quick-save extension</h3>
          <p>A standard Manifest V3 WebExtension, made for Safari. It only reads a page when you click its toolbar button.</p>
          {extensionAvailable ? (
            <Button asChild variant="outline"><a href="/downloads/my-board-extension.zip" download><Download size={16} />Download extension</a></Button>
          ) : <p className="board-message">Run <code>npm run build</code> once to prepare the extension download.</p>}
          <ol>
            <li>Install full Xcode, then run <code>npm run safari:project</code> in this project.</li>
            <li>Open the generated project in <code>build/safari</code>, choose a signing team, and run the macOS app.</li>
            <li>Enable My Board in Safari Settings → Extensions. For a local build, allow unsigned extensions in Safari’s developer settings.</li>
            <li>Open the toolbar popup and paste the connection key below.</li>
          </ol>
          <a className="board-visit" href="https://developer.apple.com/documentation/safariservices/safari-web-extensions" target="_blank" rel="noreferrer">Apple’s Safari extension guide <ArrowUpRight size={14} /></a>
        </section>
        <section className="board-settings-section">
          <h3>Connect to your board</h3>
          <p>This private key lets the extension save to this Mac. It is not an account or a cloud service.</p>
          <label className="label" htmlFor="connection-key">Connection key</label>
          <div className="board-key-row">
            <input className="field" id="connection-key" type="password" readOnly value={token} autoComplete="off" />
            <Button type="button" variant="outline" onClick={() => { void copy('key') }}>
              {copied === 'key' ? <Check size={16} /> : <Copy size={16} />}{copied === 'key' ? 'Copied' : 'Copy key'}
            </Button>
          </div>
          <p className="helper">Keep the app running at <code>http://127.0.0.1:4317</code> while saving.</p>
        </section>
        <section className="board-settings-section">
          <div className="board-inline-heading"><Bookmark size={18} /><h3>No Xcode? Use a bookmark.</h3></div>
          <p>Create a Safari bookmark called “Save to My Board”. Copy the shortcut below and paste it into the bookmark’s address field. Use it on a product page to open a ready-to-save preview here.</p>
          <Button type="button" variant="outline" onClick={() => { void copy('bookmarklet') }}>
            {copied === 'bookmarklet' ? <Check size={16} /> : <Copy size={16} />}
            {copied === 'bookmarklet' ? 'Shortcut copied' : 'Copy bookmark shortcut'}
          </Button>
          <p className="helper">Some websites block bookmark scripts. The extension is the more reliable option.</p>
        </section>
        {error && <p className="board-message board-message--error" role="alert">{error}</p>}
      </div>
    </Dialog>
  )
}
