export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`board-brand${compact ? ' board-brand--compact' : ''}`}>
      <span className="board-mark" aria-hidden="true"><i /><i /><i /><i /></span>
      <span>my board<span className="board-brand-dot">.</span></span>
    </span>
  )
}
