import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { normalizeTags } from '../../shared/model.js'

export function TagInput({ value, onChange, suggestions = [] }: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: readonly string[]
}) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const add = (input: string) => {
    const next = normalizeTags([...value, ...input.split(',')])
    if (next.length > 20 || next.some((tag) => tag.length > 40)) {
      setError('Use up to 20 tags, with at most 40 characters each.')
      return
    }
    onChange(next)
    setDraft('')
    setError('')
  }
  return (
    <div className="board-tag-field">
      <label className="label" htmlFor={id}>Tags</label>
      <div className="board-tag-input">
        {value.map((tag) => (
          <span className="board-tag board-tag--removable" key={tag}>
            {tag}
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input id={id} value={draft} ref={(input) => { input?.setCustomValidity(error) }}
          placeholder={value.length ? 'Add another…' : 'e.g. lighting, someday'}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={!!error}
          onChange={(event) => { setDraft(event.target.value); setError('') }}
          onBlur={() => { if (draft.trim()) add(draft) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              add(draft)
            } else if (event.key === 'Backspace' && !draft) {
              onChange(value.slice(0, -1))
            }
          }} />
      </div>
      <p id={`${id}-help`} className="helper">Press Enter or use a comma to add a tag.</p>
      {error && <p id={`${id}-error`} className="error" role="alert">{error}</p>}
      {suggestions.some((tag) => !value.includes(tag)) && (
        <div className="board-tag-suggestions" aria-label="Suggested tags">
          {suggestions.filter((tag) => !value.includes(tag)).slice(0, 6).map((tag) => (
            <button className="board-tag" type="button" key={tag} onClick={() => add(tag)}>+ {tag}</button>
          ))}
        </div>
      )}
    </div>
  )
}
