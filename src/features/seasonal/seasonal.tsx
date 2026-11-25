import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'

import { Switch } from '@/components/ui/switch'
import { useMessages } from '@/i18n/messages'
import { toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { SEASONAL_THEME_KEY, seasonFor } from './season'
import { messages } from './seasonal.messages'

const Snowfall = lazy(async () => ({
  default: (await import('./snowfall')).Snowfall,
}))

const PREFERENCE_EVENT = 'calorie-counter:seasonal-theme'

function subscribePreference(onChange: () => void) {
  window.addEventListener(PREFERENCE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readTurnedOff() {
  try {
    return window.localStorage.getItem(SEASONAL_THEME_KEY) === 'off'
  } catch {
    return false
  }
}

function setTurnedOff(off: boolean) {
  try {
    if (off) window.localStorage.setItem(SEASONAL_THEME_KEY, 'off')
    else window.localStorage.removeItem(SEASONAL_THEME_KEY)
  } catch {
    // Without storage the switch still works until the app reloads.
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT))
}

// The installed app can stay open for days, so the date is read again
// whenever it comes back to the foreground.
function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

const OFF_SEASON = { winter: false, christmas: false, inSeason: false }

/**
 * Today's seasonal layers on this device. `inSeason` says whether there is a
 * season to show at all, whether or not this device turned it off.
 */
export function useSeason() {
  const off = useSyncExternalStore(
    subscribePreference,
    readTurnedOff,
    () => false,
  )
  const today = useSyncExternalStore(
    subscribeVisibility,
    () => toLocalDateString(Date.now()),
    () => '',
  )
  if (!today) return OFF_SEASON
  const [, month, day] = today.split('-').map(Number)
  return {
    ...seasonFor(month, day, off),
    inSeason: seasonFor(month, day, false).winter,
  }
}

/**
 * Keeps <html>'s season classes current after the inline script set them,
 * and lets it snow while winter is on.
 */
export function SeasonalEffects() {
  const { winter, christmas } = useSeason()
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    const classes = document.documentElement.classList
    classes.toggle('winter', winter)
    classes.toggle('christmas', christmas)
  }, [winter, christmas])
  if (!winter || !resolvedTheme) return null
  return (
    <Suspense fallback={null}>
      <Snowfall dark={resolvedTheme === 'dark'} />
    </Suspense>
  )
}

/** The Settings row that turns the season off on this device. */
export function SeasonalSetting() {
  const t = useMessages(messages)
  const { winter, inSeason } = useSeason()
  if (!inSeason) return null
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-2 pr-3.5 pl-4">
      <span>{t.winterTheme}</span>
      <Switch
        checked={winter}
        onCheckedChange={(next) => setTurnedOff(!next)}
      />
    </label>
  )
}

/**
 * The night sky behind Today's title on phones: drifting clouds over a navy
 * sky ending in a snowbank in light mode; in dark mode the page itself is the
 * night, so only the clouds remain. It sits under the snow.
 */
export function WinterSky({ tall }: { tall: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn('winter-sky md:hidden', tall && 'winter-sky-tall')}
    >
      <div className="winter-clouds" />
      <svg
        className="winter-snowbank"
        viewBox="0 0 390 30"
        preserveAspectRatio="none"
      >
        <path d="M0 14 C 30 4, 60 6, 90 12 C 120 18, 150 20, 185 12 C 215 6, 250 4, 285 12 C 315 19, 350 18, 390 10 L 390 30 L 0 30 Z" />
      </svg>
    </div>
  )
}

const BULB_COLORS = ['red', 'gold', 'green', 'blue'] as const
const SWAGS = [
  [
    [-5, 6],
    [60, 30],
    [130, 8],
  ],
  [
    [130, 8],
    [195, 32],
    [260, 8],
  ],
  [
    [260, 8],
    [325, 30],
    [395, 6],
  ],
] as const
// Four bulbs along each of the three swags, in a 390 × 48 box.
const BULBS = SWAGS.flatMap(([p0, p1, p2]) =>
  [0.15, 0.38, 0.62, 0.85].map((u) => {
    const k = 1 - u
    return {
      x: k * k * p0[0] + 2 * k * u * p1[0] + u * u * p2[0],
      y: k * k * p0[1] + 2 * k * u * p1[1] + u * u * p2[1],
    }
  }),
).map((point, index) => ({
  ...point,
  color: BULB_COLORS[index % BULB_COLORS.length],
  // Uneven timing, so the string flickers like real bulbs, not in lockstep.
  delay: (index * 0.37) % 2.6,
  duration: 1.9 + ((index * 0.73) % 1.7),
}))

/** A string of twinkling lights across the top of Today on phones. */
export function StringLights() {
  return (
    <div aria-hidden="true" className="string-lights md:hidden">
      <svg viewBox="0 0 390 48" preserveAspectRatio="none">
        <path
          d="M-5 6 Q 60 30 130 8 Q 195 32 260 8 Q 325 30 395 6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {BULBS.map((bulb, index) => (
        <span
          key={index}
          data-color={bulb.color}
          style={{
            left: `${((bulb.x - 4) / 390) * 100}%`,
            top: `${bulb.y + 2}px`,
            animationDelay: `${bulb.delay}s`,
            animationDuration: `${bulb.duration}s`,
          }}
        />
      ))}
    </div>
  )
}

const BAUBLES = [
  { x: 25, y: 21, r: 2, color: 'red', delay: 0 },
  { x: 34, y: 22.5, r: 2, color: 'gold', delay: 0.9 },
  { x: 19, y: 35, r: 2, color: 'blue', delay: 1.6 },
  { x: 29, y: 33, r: 2, color: 'red', delay: 0.4 },
  { x: 40, y: 34.5, r: 2, color: 'gold', delay: 2.1 },
  { x: 14, y: 50, r: 2.2, color: 'gold', delay: 1.2 },
  { x: 24, y: 47, r: 2.2, color: 'blue', delay: 0.2 },
  { x: 35, y: 49.5, r: 2.2, color: 'red', delay: 1.9 },
  { x: 45, y: 50, r: 2.2, color: 'blue', delay: 0.7 },
] as const

/** A small decorated tree: snowy tiers, twinkling baubles and a gold star. */
export function ChristmasTree({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 60 72"
      className={cn('christmas-tree', className)}
    >
      <ellipse className="tree-mound" cx="30" cy="67" rx="24" ry="4.5" />
      <rect
        className="tree-trunk"
        x="26.5"
        y="56"
        width="7"
        height="10"
        rx="1"
      />
      <path className="tree-tier-1" d="M30 28 L55 56 Q30 62 5 56 Z" />
      <path
        className="tree-snow"
        d="M6 56 Q 30 62 54 56 L 52 54.5 Q 47 57 43 55.5 Q 38 58.5 33 56.8 Q 28 59 23 56.8 Q 18 58.5 13 55.5 Q 9 57 8 54.5 Z"
      />
      <path className="tree-tier-2" d="M30 17 L48 40 Q30 45 12 40 Z" />
      <path
        className="tree-snow"
        d="M13 40 Q 30 45 47 40 L 45.5 38.6 Q 41 41 37.5 39.8 Q 33.5 42.5 30 41.6 Q 26.5 42.5 22.5 39.8 Q 19 41 14.5 38.6 Z"
      />
      <path className="tree-tier-3" d="M30 8 L42 26 Q30 30 18 26 Z" />
      <path
        className="tree-snow"
        d="M19 26 Q 30 30 41 26 L 39.6 24.6 Q 36 27 33 26 Q 30 28 27 26 Q 24 27 20.4 24.6 Z"
      />
      {BAUBLES.map((bauble, index) => (
        <circle
          key={index}
          className="tree-bauble"
          data-color={bauble.color}
          cx={bauble.x}
          cy={bauble.y}
          r={bauble.r}
          style={{ animationDelay: `${bauble.delay}s` }}
        />
      ))}
      <polygon
        className="tree-star"
        points="30,1 31.53,4.9 35.71,5.15 32.47,7.8 33.53,11.85 30,9.6 26.47,11.85 27.53,7.8 24.29,5.15 28.47,4.9"
      />
    </svg>
  )
}

/** Snow resting on the Log meal button. */
export function SnowCap() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 52 16"
      // Sized inline: the button sizes every icon inside it to 24px.
      className="snow-cap pointer-events-none absolute -top-1.5 -left-0.5"
      style={{ width: 56, height: 18 }}
    >
      <path d="M4 14 C 4 6, 12 2, 20 4 C 26 0, 34 1, 38 5 C 44 4, 50 8, 48 14 C 44 12, 40 15, 36 12 C 32 15, 27 12, 24 15 C 20 12, 15 15, 12 12 C 9 15, 6 12, 4 14 Z" />
    </svg>
  )
}
