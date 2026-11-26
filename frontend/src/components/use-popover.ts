import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react'

const visibleFrame = { opacity: 1, transform: 'translateX(0)' }
const fadedFrame = { opacity: 0, transform: 'translateX(10px)' }
let visiblePopovers = 0

export function usePopoverBackdrop(visible: boolean) {
  useLayoutEffect(() => {
    if (!visible) return

    // Keep one backdrop behind all popovers, including those fading out.
    const body = document.body
    visiblePopovers += 1
    body.classList.add('has-popover')
    return () => {
      visiblePopovers -= 1
      if (visiblePopovers === 0) body.classList.remove('has-popover')
    }
  }, [visible])
}

export function usePopover({
  dismissOnScroll = true,
  animate = false,
  anchorToTrigger = false,
  initialFocus,
}: {
  dismissOnScroll?: boolean
  animate?: boolean
  anchorToTrigger?: boolean
  initialFocus?: RefObject<HTMLElement | null>
} = {}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const motion = useRef<Animation | null>(null)
  const [position, setPosition] = useState<{
    x: number
    top: number
    open: boolean
  } | null>(null)
  const open = position?.open ?? false
  usePopoverBackdrop(position !== null)

  const dismiss = useCallback(() => {
    setPosition((current) => {
      if (!current?.open) return current
      return animate ? { ...current, open: false } : null
    })
  }, [animate])

  const close = useCallback(() => {
    dismiss()
    trigger.current?.focus({ preventScroll: true })
  }, [dismiss])

  useLayoutEffect(() => () => {
    motion.current?.cancel()
    motion.current = null
  }, [])

  useLayoutEffect(() => {
    if (!animate) return

    const node = panel.current
    if (!node || !position) {
      motion.current?.cancel()
      motion.current = null
      return
    }

    const opening = position.open
    const finishExit = () => {
      setPosition((current) => (current === position ? null : current))
    }

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof node.animate !== 'function'
    ) {
      motion.current?.cancel()
      motion.current = null
      if (!opening) finishExit()
      return
    }

    let from = opening ? fadedFrame : visibleFrame
    if (motion.current?.playState === 'running') {
      // A rapid toggle reverses from the current appearance.
      const current = getComputedStyle(node)
      from = { opacity: Number(current.opacity), transform: current.transform }
    }
    motion.current?.cancel()
    const animation = node.animate([from, opening ? visibleFrame : fadedFrame], {
      duration: opening ? 200 : 160,
      easing: opening ? 'ease-out' : 'ease-in',
      fill: opening ? 'backwards' : 'both',
    })
    motion.current = animation
    if (!opening) void animation.finished.then(finishExit, () => {})
  }, [animate, position])

  useEffect(() => {
    if (!open) return
    const focusTarget = initialFocus?.current ?? panel.current
    focusTarget?.focus({ preventScroll: true })

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
      close()
    }

    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    document.addEventListener('keydown', handleEscape)
    if (dismissOnScroll) window.addEventListener('scroll', dismiss)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }, [close, dismiss, dismissOnScroll, initialFocus, open])

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    if (open) {
      close()
      return
    }

    const { left, width, bottom } = event.currentTarget.getBoundingClientRect()
    setPosition({
      x: !anchorToTrigger && event.detail ? event.clientX : left + width / 2,
      top: bottom + 8,
      open: true,
    })
  }

  const style = position && {
    left: `clamp(12px, calc(${position.x}px - var(--popover-width) / 2), calc(100% - var(--popover-width) - 12px))`,
    top: position.top,
    maxHeight: `min(32rem, calc(100dvh - ${position.top + 12}px))`,
  }

  return { id, trigger, panel, open, style, toggle, close }
}
