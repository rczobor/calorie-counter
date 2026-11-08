import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The one segmented control: History's range, Cooking, AI assistants and the
 * recipe line mode. Tabs (`data-active`, from `TabsTrigger`) and toggle
 * groups (`aria-pressed`) share the look, so the selected segment is raised
 * the same way in both. Labels use the control text size, like buttons.
 */
export const SEGMENT_LIST_CLASS = 'flex w-max min-w-full'

export const SEGMENT_CLASS = cn(
  'inline-flex min-h-9 flex-1 items-center justify-center rounded-full px-3 type-subhead font-medium whitespace-nowrap text-foreground transition-[background-color,box-shadow] sm:flex-none sm:px-5',
  'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  'not-data-active:not-aria-pressed:hover:bg-foreground/5',
  'data-active:bg-segment data-active:font-semibold data-active:shadow-(--segment-shadow)',
  'aria-pressed:bg-segment aria-pressed:font-semibold aria-pressed:shadow-(--segment-shadow)',
)

// Keeps the selected segment clear of the edge fade when it scrolls into view.
const FADE_WIDTH = 48

/**
 * The control's track. Segments fill it when they fit; otherwise they scroll
 * inside it, without a scrollbar, behind a fade on each side that has more,
 * and the selected segment scrolls into view. The page never scrolls
 * sideways. Pass the list (`role="tablist"` or `role="group"`, laid out with
 * `SEGMENT_LIST_CLASS`) as the only child.
 */
export function SegmentedTrack({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = scrollerRef.current
    const track = scroller?.parentElement
    if (!scroller || !track) return
    const updateFades = () => {
      const end = scroller.scrollWidth - scroller.clientWidth
      track.toggleAttribute('data-fade-start', scroller.scrollLeft > 1)
      track.toggleAttribute('data-fade-end', scroller.scrollLeft < end - 1)
    }
    const reveal = (animate: boolean) => {
      if (scroller.scrollWidth <= scroller.clientWidth) return
      const selected = scroller.querySelector<HTMLElement>(
        '[data-active], [aria-pressed="true"]',
      )
      if (!selected) return
      const behavior =
        animate &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'smooth'
          : 'instant'
      const start = selected.offsetLeft - FADE_WIDTH
      const end = selected.offsetLeft + selected.offsetWidth + FADE_WIDTH
      if (start < scroller.scrollLeft)
        scroller.scrollTo({ left: start, behavior })
      else if (end > scroller.scrollLeft + scroller.clientWidth)
        scroller.scrollTo({ left: end - scroller.clientWidth, behavior })
    }
    reveal(false)
    updateFades()
    // The selection lives in the list's own state, so watch its attributes.
    const selection = new MutationObserver(() => reveal(true))
    selection.observe(scroller, {
      subtree: true,
      attributeFilter: ['data-active', 'aria-pressed'],
    })
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateFades)
    resize?.observe(scroller)
    if (scroller.firstElementChild) resize?.observe(scroller.firstElementChild)
    scroller.addEventListener('scroll', updateFades, { passive: true })
    return () => {
      selection.disconnect()
      resize?.disconnect()
      scroller.removeEventListener('scroll', updateFades)
    }
  }, [])

  const fade =
    'pointer-events-none absolute inset-y-0 w-12 from-muted from-30% to-transparent opacity-0 transition-opacity motion-reduce:transition-none'
  return (
    <div
      className={cn(
        'group/segmented relative w-full rounded-full bg-muted sm:w-fit',
        className,
      )}
    >
      <div
        ref={scrollerRef}
        className="relative overflow-x-auto overscroll-x-contain rounded-full p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          fade,
          'left-0 rounded-l-full bg-linear-to-r group-data-fade-start/segmented:opacity-100',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          fade,
          'right-0 rounded-r-full bg-linear-to-l group-data-fade-end/segmented:opacity-100',
        )}
      />
    </div>
  )
}
