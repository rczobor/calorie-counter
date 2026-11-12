import { useRouterState } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  UserRound,
} from 'lucide-react'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { SkeletonRows } from '@/components/page/loading-content'
import { buttonVariants, chipClass } from '@/components/ui/button'
import {
  SEGMENT_CLASS,
  SEGMENT_LIST_CLASS,
  SegmentedTrack,
} from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { messages as headerMessages } from '@/components/Header.messages'
import { messages as todayMessages } from '@/features/meals/day-dashboard.messages'
import { messages as weightMessages } from '@/features/weight/weight-glance.messages'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { formatDate, linkedDate } from '@/lib/dates'
import { messages as historyMessages } from '@/routes/history.messages'
import { toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { messages } from './page-placeholder.messages'

/** A meal row: its name and food count. */
export const MEAL_ROW_HEIGHT = 'h-[4.125rem]'

/**
 * The one placeholder for waits before a page can render: the session, the
 * household and route code. It takes the shape of the page being opened, with
 * the labels that page will show, so consecutive waits look like one and the
 * page's own loading state, then its data, replace it in place. It appears
 * only after a short delay, so fast loads show nothing at all.
 */
// The labels come from the pages' own messages, so the two never drift apart.
export function PagePlaceholder({ label }: { label?: string }) {
  const t = useMessages(messages)
  const { pathname, searchStr } = useRouterState({
    select: (state) => state.location,
  })
  return (
    <PagePlaceholderView
      label={label ?? t.loadingPage}
      pathname={pathname}
      searchStr={searchStr}
    />
  )
}

// How many placeholders are mounted. Handing a wait from one gate to the next
// (session, household, route code) mounts the next placeholder in the same
// commit that removes the last. While it renders, the last one is still in the
// document, so the new one picks up its fade where it was instead of starting
// over: a quick handoff stays invisible and a slow one never blinks.
let mounted = 0
const REVEAL_MS = 160 + 240 // `loading-reveal`: delay plus fade

// Time since the wait began. A placeholder that continued one runs its own
// fade with a shifted delay, so its clock starts `160 - delay` into the wait.
function revealElapsed() {
  const fade = document
    .querySelector('[data-page-placeholder]')
    ?.getAnimations?.()[0]
  const time = fade?.currentTime
  if (typeof time !== 'number') return REVEAL_MS
  const delay = Number(fade?.effect?.getTiming().delay ?? 160)
  return Math.min(time + 160 - delay, REVEAL_MS)
}
const subscribeNoop = () => () => {}

export function PagePlaceholderView({
  label,
  pathname,
  searchStr,
}: {
  label: string
  pathname: string
  searchStr: string
}) {
  const [elapsed] = useState(() => (mounted > 0 ? revealElapsed() : null))
  useEffect(() => {
    mounted++
    return () => {
      mounted--
    }
  }, [])
  const body =
    pathname === '/' ? (
      <TodayPlaceholder
        date={linkedDate(new URLSearchParams(searchStr).get('date'))}
      />
    ) : pathname === '/history' ? (
      <HistoryPlaceholder />
    ) : (
      <>
        <TitleRow />
        <div className="mt-6 inset-group inset-rows">
          <SkeletonRows rows={3} inset />
        </div>
      </>
    )
  return (
    <main className="flex-1 bg-background">
      <section
        role="status"
        aria-label={label}
        data-page-placeholder=""
        className="mx-auto w-full max-w-3xl loading-reveal px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-6 sm:px-6 md:pt-8"
        style={
          elapsed === null
            ? undefined
            : { animationDelay: `${160 - elapsed}ms` }
        }
      >
        <div aria-hidden="true">{body}</div>
      </section>
    </main>
  )
}

/** A person picker that has no people yet: the chip, with a bar for the name. */
export function PersonPickerPlaceholder({ label }: { label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cn(chipClass, 'pointer-events-none')}
    >
      <UserRound aria-hidden="true" className="text-muted-foreground" />
      <Skeleton aria-hidden="true" className="h-3.5 w-8" />
      <ChevronDown aria-hidden="true" className="text-muted-foreground" />
    </span>
  )
}

function TitleRow({ title, picker }: { title?: string; picker?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {title ? (
        <p className="type-large-title text-foreground">{title}</p>
      ) : (
        <div className="flex h-[2.5625rem] items-center">
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
      )}
      {picker ? <PersonPickerPlaceholder /> : null}
    </div>
  )
}

function InertIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        buttonVariants({ variant: 'outline', size: 'icon-sm' }),
        'pointer-events-none',
      )}
    >
      {children}
    </span>
  )
}

// Mirrors the day dashboard while it loads: title, day controls, the intake
// card, weight and meals.
function TodayPlaceholder({ date }: { date: string | null }) {
  const locale = useLocale()
  const t = todayMessages[locale]
  const [today] = useState(() => toLocalDateString(Date.now()))
  // The prerendered shell cannot know the visitor's day, so the date shows
  // once hydrated, as a bar before that.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
  const day = date ?? today
  return (
    <>
      <TitleRow title={day === today ? t.today : undefined} picker />
      <div className="mt-3 flex items-center justify-between gap-1.5">
        <span
          className={cn(
            chipClass,
            'pointer-events-none pl-3 proportional-nums',
          )}
        >
          {hydrated ? (
            formatDate(day, locale, { year: 'always' })
          ) : (
            <Skeleton className="h-3.5 w-28" />
          )}
          <ChevronDown className="text-muted-foreground" />
        </span>
        <div className="flex items-center gap-1.5">
          <InertIcon>
            <ChevronLeft />
          </InertIcon>
          <InertIcon>
            <ChevronRight />
          </InertIcon>
        </div>
      </div>
      <div className="mt-5 inset-group p-4">
        <IntakeSkeleton />
      </div>
      <WeightRowPlaceholder />
      <div className="mt-8 flex items-center justify-between gap-3">
        <p className="type-title">{t.meals}</p>
        {/* Desktop logs from here; it waits disabled, as the page's does. */}
        <span
          className={cn(
            buttonVariants({ size: 'sm' }),
            'pointer-events-none hidden bg-disabled text-disabled-foreground md:inline-flex',
          )}
        >
          <Plus />
          {headerMessages[locale].logMeal}
        </span>
      </div>
      <div className="mt-3 inset-group inset-rows">
        <SkeletonRows rows={3} inset className={MEAL_ROW_HEIGHT} />
      </div>
    </>
  )
}

/** Today's weight row before its person is known, as the row draws itself. */
export function WeightRowPlaceholder() {
  const t = useMessages(weightMessages)
  return (
    <div
      aria-hidden="true"
      className="mt-3 flex min-h-12 items-center gap-3 inset-group py-2.5 pr-3.5 pl-4 text-base"
    >
      <span className="flex-1">{t.weight}</span>
      <Skeleton className="h-4 w-20" />
      <ChevronRight className="size-4 text-muted-foreground" />
    </div>
  )
}

/** The intake card's balance, bar and logged line, before the numbers arrive. */
export function IntakeSkeleton() {
  return (
    <>
      <Skeleton className="h-14 w-56" />
      <div className="mt-4 h-2.5 rounded-full bg-track" />
      <Skeleton className="mt-2.5 h-5 w-44" />
    </>
  )
}

function HistoryPlaceholder() {
  const t = useMessages(historyMessages)
  return (
    <>
      <TitleRow title={t.title} picker />
      <div className="mt-4 space-y-6">
        <SegmentedTrack>
          <div className={SEGMENT_LIST_CLASS}>
            <span data-active="" className={SEGMENT_CLASS}>
              {t.days(7)}
            </span>
            <span className={SEGMENT_CLASS}>{t.days(30)}</span>
            <span className={SEGMENT_CLASS}>{t.customRange}</span>
          </div>
        </SegmentedTrack>
        <HistorySkeleton />
      </div>
    </>
  )
}

/**
 * History's averages, chart and days with their fixed labels and bars where
 * the numbers go, so data replaces it in place.
 */
export function HistorySkeleton({ label }: { label?: string }) {
  const t = useMessages(historyMessages)
  return (
    <div
      role={label ? 'status' : undefined}
      aria-label={label}
      className="space-y-6"
    >
      <div aria-hidden="true" className="inset-group">
        <div className="grid grid-cols-2">
          {[t.dailyAverage, t.daysWithMeals].map((stat) => (
            <div key={stat} className="px-4 py-3 not-first:border-l">
              <p className="type-footnote text-muted-foreground">{stat}</p>
              <Skeleton className="mt-1.5 h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="inset-group px-4 pt-3.5 pb-1">
        <p className="type-headline">{t.dailyCalories}</p>
        <Skeleton className="mt-3 h-52 w-full rounded-lg bg-skeleton/50 md:h-64" />
      </div>
      <div aria-hidden="true">
        <p className="type-title">{t.daysHeading}</p>
        <div className="mt-3 inset-group inset-rows">
          <SkeletonRows rows={3} inset className="h-[3.875rem]" />
        </div>
      </div>
    </div>
  )
}
