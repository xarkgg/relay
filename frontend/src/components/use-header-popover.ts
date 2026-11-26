import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'

export function useHeaderPopover() {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const [position, setPosition] = useState<{ x: number; top: number } | null>(null)

  useEffect(() => {
    if (!position) return
    panel.current?.focus({ preventScroll: true })

    const dismiss = () => setPosition(null)
    const dismissOutside = (event: Event) => {
      const target = event.target
      if (
        target instanceof Node &&
        !trigger.current?.contains(target) &&
        !panel.current?.contains(target)
      ) {
        dismiss()
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      dismiss()
      trigger.current?.focus({ preventScroll: true })
    }

    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', dismiss)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }, [position])

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    if (position) {
      setPosition(null)
      event.currentTarget.focus({ preventScroll: true })
      return
    }

    const { left, width, bottom } = event.currentTarget.getBoundingClientRect()
    setPosition({
      x: event.detail ? event.clientX : left + width / 2,
      top: bottom + 8,
    })
  }

  const style = position && {
    left: `clamp(12px, calc(${position.x}px - var(--popover-width) / 2), calc(100% - var(--popover-width) - 12px))`,
    top: position.top,
    maxHeight: `min(32rem, calc(100dvh - ${position.top + 12}px))`,
  }

  return { id, trigger, panel, style, toggle }
}
