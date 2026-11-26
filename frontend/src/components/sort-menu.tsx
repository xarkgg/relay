import { useRef, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { usePopover } from './use-popover'

const sortOptions = ['Relevance', 'Top rated', 'Most popular'] as const
export type AgentSort = (typeof sortOptions)[number]

export default function SortMenu({
  value,
  onChange,
}: {
  value: AgentSort
  onChange: (value: AgentSort) => void
}) {
  const selected = useRef<HTMLButtonElement>(null)
  const { id, trigger, panel, open, style, toggle, close } = usePopover({
    anchorToTrigger: true,
    initialFocus: selected,
  })

  function handleMenuKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Tab') {
      close()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    )
    const current = options.findIndex((option) => option === document.activeElement)
    const last = options.length - 1
    let next = 0
    if (event.key === 'End') next = last
    if (event.key === 'ArrowDown') next = current < last ? current + 1 : 0
    if (event.key === 'ArrowUp') next = current > 0 ? current - 1 : last
    options[next]?.focus()
  }

  return (
    <div className="sort-label">
      Sort by:
      <button
        ref={trigger}
        type="button"
        className="sort-value"
        aria-label={`Sort agents: ${value}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
      >
        <span>{value}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {style && (
        <section
          ref={panel}
          id={id}
          className="popover sort-menu"
          role="menu"
          aria-label="Sort agents"
          tabIndex={-1}
          style={style}
          onKeyDown={handleMenuKeyDown}
        >
          {sortOptions.map((option) => (
            <button
              key={option}
              ref={option === value ? selected : undefined}
              type="button"
              role="menuitemradio"
              aria-label={option}
              aria-checked={option === value}
              tabIndex={-1}
              onClick={() => {
                onChange(option)
                close()
              }}
            >
              {option}
              {option === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
