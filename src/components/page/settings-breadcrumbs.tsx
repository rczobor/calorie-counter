import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import type { ReactElement } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './settings-breadcrumbs.messages'

// Phones have no top app bar, so the parent level is a 44px "‹ Back" target.
// From md up the same elements read as breadcrumbs.
const backClass =
  'inline-flex min-h-11 items-center gap-0.5 rounded-md pr-2 type-body text-foreground md:min-h-8 md:pr-0 md:type-footnote md:text-muted-foreground md:hover:text-foreground'

function BackChevron() {
  return (
    <ChevronLeft
      aria-hidden="true"
      className="-ml-2 size-6 md:hidden"
      strokeWidth={2.25}
    />
  )
}

type Level = {
  label: string
  /** The element that navigates there, such as `<Link to="/catalog" />`. */
  link: ReactElement
}

/**
 * Phones show only the level a back tap returns to; desktop shows the trail.
 * The trail starts at Settings unless `root` names another home (Weight lives
 * under Today). `parent` is a level between the root and the current page
 * (the Food library above one of its sections), so it becomes the phone's
 * back target. With `onCurrentClick`, the current page has a sub-view open
 * (such as a cooked food), so the phone's back target returns to the page
 * itself.
 */
export function SettingsBreadcrumbs({
  current,
  root,
  parent,
  onCurrentClick,
}: {
  current: string
  root?: Level
  parent?: Level
  onCurrentClick?: () => void
}) {
  const t = useMessages(messages)
  const home = root ?? { label: t.settings, link: <Link to="/settings" /> }
  const back = onCurrentClick ? 'current' : parent ? 'parent' : 'root'
  return (
    <Breadcrumb className="mb-1 md:mb-5">
      <BreadcrumbList>
        <BreadcrumbItem className={cn(back !== 'root' && 'max-md:hidden')}>
          <BreadcrumbLink className={backClass} render={home.link}>
            <BackChevron />
            {home.label}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {parent ? (
          <>
            <BreadcrumbSeparator className="max-md:hidden" />
            <BreadcrumbItem
              className={cn(back !== 'parent' && 'max-md:hidden')}
            >
              <BreadcrumbLink className={backClass} render={parent.link}>
                <BackChevron />
                {parent.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </>
        ) : null}
        <BreadcrumbSeparator className="max-md:hidden" />
        <BreadcrumbItem className={cn(back !== 'current' && 'max-md:hidden')}>
          {onCurrentClick ? (
            <button
              type="button"
              className={backClass}
              onClick={onCurrentClick}
            >
              <BackChevron />
              {current}
            </button>
          ) : (
            <BreadcrumbPage>{current}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
