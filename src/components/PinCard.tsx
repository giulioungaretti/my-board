import { useState, type MouseEvent } from 'react'
import { ArrowUpRight, ImageOff, Star } from 'lucide-react'
import { sourceName, type Pin } from '../../shared/model.js'

export function ProductImage({ src, title, className, width, height }: {
  src: string | null
  title: string
  className?: string
  width?: number | null
  height?: number | null
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) {
    return (
      <div className={`board-no-image ${className ?? ''}`}>
        <ImageOff size={28} strokeWidth={1.25} />
        <span>{src ? 'Picture unavailable' : 'No picture saved'}</span>
      </div>
    )
  }
  return (
    <img className={className} src={src} alt={title} loading="lazy" decoding="async"
      width={width ?? undefined} height={height ?? undefined} referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)} />
  )
}

export function PinCard({ pin, onOpen, onFavorite, onTag, pending }: {
  pin: Pin
  onOpen: () => void
  onFavorite: () => void
  onTag: (tag: string) => void
  pending: boolean
}) {
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus()
    onOpen()
  }
  return (
    <article className="board-pin" data-testid="pin-card">
      <div className="board-pin-picture">
        <button type="button" className="board-pin-open" onClick={open} aria-label={`View ${pin.title}`}>
          <ProductImage src={pin.imagePath} title={pin.title} width={pin.imageWidth} height={pin.imageHeight} />
        </button>
        <button type="button" className="board-pin-star" aria-label={`${pin.favorite ? 'Unfavorite' : 'Favorite'} ${pin.title}`}
          aria-pressed={pin.favorite} disabled={pending} onClick={onFavorite}>
          <Star size={17} fill={pin.favorite ? 'currentColor' : 'none'} strokeWidth={1.7} />
        </button>
      </div>
      <div className="board-pin-details">
        <a className="board-source" href={pin.url} target="_blank" rel="noreferrer">
          {sourceName(pin.url)}<ArrowUpRight size={12} aria-label="Opens in a new tab" />
        </a>
        <h2><button type="button" onClick={open}>{pin.title}</button></h2>
        {pin.notes && <p className="board-pin-note">{pin.notes}</p>}
        {pin.tags.length > 0 && (
          <div className="board-pin-tags" aria-label="Tags">
            {pin.tags.slice(0, 3).map((tag) => (
              <button type="button" className="board-tag" key={tag} onClick={() => onTag(tag)}>{tag}</button>
            ))}
            {pin.tags.length > 3 && <span className="board-tag-overflow">+{pin.tags.length - 3}</span>}
          </div>
        )}
      </div>
    </article>
  )
}
