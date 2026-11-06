import { Children, useLayoutEffect, useRef, type ReactNode } from 'react'

export function Masonry({ children, compact }: { children: ReactNode; compact: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const grid = ref.current
    if (!grid) return
    const measure = (content: Element) => {
      const item = content.parentElement
      if (!item) return
      const style = getComputedStyle(grid)
      const row = Number.parseFloat(style.gridAutoRows)
      const gap = Number.parseFloat(style.getPropertyValue('--board-item-gap'))
      item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((content.getBoundingClientRect().height + gap) / row))}`
    }
    const observer = new ResizeObserver((entries) => entries.forEach((entry) => measure(entry.target)))
    for (const item of grid.children) {
      const content = item.firstElementChild
      if (content) {
        measure(content)
        observer.observe(content)
      }
    }
    return () => observer.disconnect()
  }, [children, compact])

  return (
    <div ref={ref} className={`board-masonry${compact ? ' board-masonry--compact' : ''}`} aria-label="Saved products">
      {Children.map(children, (child) => child ? <div className="board-masonry-item">{child}</div> : null)}
    </div>
  )
}
