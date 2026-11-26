import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Command, Search } from 'lucide-react'
import { usePopoverBackdrop } from './use-popover'

export default function AgentSearch({
  query,
  onQueryChange,
  suggestions,
}: {
  query: string
  onQueryChange: (query: string) => void
  suggestions: { title: string; category: string; author: string }[]
}) {
  const listId = useId()
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const activeSuggestion = suggestions[activeIndex]
  const activeId = open && activeSuggestion
    ? `${listId}-${activeIndex}`
    : undefined

  usePopoverBackdrop(open)

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  useEffect(() => {
    function openWithShortcut(event: globalThis.KeyboardEvent) {
      const field = input.current
      if (
        !field ||
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k' ||
        document.querySelector('dialog:modal')
      ) {
        return
      }

      event.preventDefault()
      field.focus()
      setOpen(true)
    }

    document.addEventListener('keydown', openWithShortcut)
    return () => document.removeEventListener('keydown', openWithShortcut)
  }, [])

  useEffect(() => {
    if (!open) return

    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !box.current?.contains(event.target)) {
        close()
      }
    }

    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, close])

  useEffect(() => {
    if (activeId) {
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeId])

  function selectSuggestion(title: string) {
    onQueryChange(title)
    input.current?.focus({ preventScroll: true })
    close()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.altKey || event.metaKey || event.ctrlKey) {
      return
    }

    if (open && event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (open && event.key === 'Enter') {
      event.preventDefault()
      if (activeSuggestion) selectSuggestion(activeSuggestion.title)
      else close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (!suggestions.length) return

      const lastIndex = suggestions.length - 1
      let nextIndex = (activeIndex + 1) % suggestions.length
      if (event.key === 'ArrowUp') {
        nextIndex = activeIndex > 0 ? activeIndex - 1 : lastIndex
      }
      setActiveIndex(nextIndex)
    }
  }

  return (
    <div
      ref={box}
      className="search-box"
      data-open={open || undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close()
      }}
    >
      <div className="search-surface">
        <label className="search-field">
          <Search size={22} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label="Search agents"
            aria-autocomplete="list"
            aria-keyshortcuts="Meta+K Control+K"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={activeId}
            autoComplete="off"
            placeholder="Search agents, use cases, categories"
            value={query}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            onChange={(event) => {
              onQueryChange(event.target.value)
              setActiveIndex(-1)
              setOpen(true)
            }}
          />
          <span className="shortcut" aria-hidden="true">
            <Command size={13} /> K
          </span>
        </label>
        {open && (
          <div className="search-suggestions">
            <div className="search-suggestion-content">
              <p className="search-suggestion-status" role="status">
                {suggestions.length ? 'Agent suggestions' : 'No matching agents.'}
              </p>
              <ul
                id={listId}
                className="search-suggestion-list"
                role="listbox"
                aria-label="Agent suggestions"
                hidden={!suggestions.length}
              >
                {suggestions.map(({ title, category, author }, index) => (
                  <li key={title} role="presentation">
                    <button
                      id={`${listId}-${index}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={index === activeIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(title)}
                    >
                      <strong>{title}</strong>
                      <span>
                        {category} · {author}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
