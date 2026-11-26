import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { useRouterState } from '@tanstack/react-router'

import { Switch } from '@/components/ui/switch'
import { useMessages } from '@/i18n/messages'
import { toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import {
  SEASONAL_THEME_KEY,
  WINTER_STATUS_BAR,
  seasonFor,
  snowmanStage,
} from './season'
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
    // Without storage the season stays on; the switch has nowhere to keep it.
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT))
}

// The installed app can stay open for days, so the date is read again at
// each local midnight and whenever it comes back to the foreground, where a
// timer may have slept past midnight. Every reader then switches together.
function subscribeToday(onChange: () => void) {
  let timer = 0
  function untilMidnight() {
    const now = new Date()
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    )
    timer = window.setTimeout(() => {
      onChange()
      untilMidnight()
    }, midnight.getTime() - now.getTime())
  }
  function onVisibility() {
    window.clearTimeout(timer)
    untilMidnight()
    onChange()
  }
  untilMidnight()
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

const OFF_SEASON = {
  winter: false,
  christmas: false,
  inSeason: false,
  snowman: 0,
}

/**
 * Today's seasonal layers on this device. `inSeason` says whether there is a
 * season to show at all, whether or not this device turned it off, and
 * `snowman` how much of the phone's snowman is built (see `snowmanStage`).
 */
export function useSeason() {
  const off = useSyncExternalStore(
    subscribePreference,
    readTurnedOff,
    () => false,
  )
  const today = useSyncExternalStore(
    subscribeToday,
    () => toLocalDateString(Date.now()),
    () => '',
  )
  if (!today) return OFF_SEASON
  const [, month, day] = today.split('-').map(Number)
  return {
    ...seasonFor(month, day, off),
    inSeason: seasonFor(month, day, false).winter,
    snowman: off ? 0 : snowmanStage(month, day),
  }
}

// The app's own theme: the `dark` class next-themes puts on <html>, which
// can differ from the phone's setting. Unknown until the page is running.
function subscribeThemeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/**
 * The colours for the installed app's status bar, a solid bar iOS paints
 * from theme-color. In winter they match the top of the page (the night
 * sky, or light mode's frost away from Today). Once the app's own theme is
 * known, both media variants take that theme's colour, so a dark app on a
 * light phone never gets a light bar.
 */
export function useStatusBarColors(normal: { light: string; dark: string }) {
  const { winter } = useSeason()
  const onToday = useRouterState({
    select: (state) => state.location.pathname === '/',
  })
  const appDark = useSyncExternalStore<boolean | null>(
    subscribeThemeClass,
    () => document.documentElement.classList.contains('dark'),
    () => null,
  )
  const colors = winter
    ? {
        light: onToday ? WINTER_STATUS_BAR.today : WINTER_STATUS_BAR.light,
        dark: WINTER_STATUS_BAR.dark,
      }
    : normal
  // Once the app's theme is known these colours are final, so the season
  // script's early tag can go (see season.ts).
  useEffect(() => {
    if (appDark !== null)
      document.querySelector('meta[data-season-status-bar]')?.remove()
  }, [appDark])
  if (appDark === null) return colors
  const color = appDark ? colors.dark : colors.light
  return { light: color, dark: color }
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
    <>
      {/* Snow lying along the bottom of the window; the snow falls in
          front of it. */}
      <div aria-hidden="true" className="snow-drift">
        <svg viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0 34 C 80 18, 160 22, 240 30 C 330 40, 420 38, 510 26 C 600 14, 700 16, 790 28 C 880 40, 980 40, 1060 26 C 1120 16, 1170 18, 1200 24 L 1200 60 L 0 60 Z" />
        </svg>
      </div>
      <Snowman className="snowman-ground hidden lg:block" />
      <Suspense fallback={null}>
        <Snowfall dark={resolvedTheme === 'dark'} />
      </Suspense>
    </>
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
 * A snowman, built as far as `stage` (see `snowmanStage`). A whole one stands
 * on the drift's right-hand rise, where wide windows have an empty margin
 * beside the page; phones build one where the tree stood. The scarf takes
 * the tint, so it is cranberry over Christmas.
 */
export function Snowman({
  stage = 5,
  className,
}: {
  stage?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 44 58"
      className={cn('snowman', className)}
    >
      {stage >= 4 ? (
        <>
          <path className="snowman-arm" d="M12 34 L2 26 M5 28.5 L3 32" />
          <path className="snowman-arm" d="M32 34 L42 27 M39 29 L42 32" />
        </>
      ) : null}
      <circle className="snowman-snow" cx="22" cy="41" r="13" />
      {/* Shade on the side away from the moon. */}
      <path
        className="snowman-shade"
        d="M30 30.8 A 13 13 0 0 1 22 54 A 13 13 0 0 1 12.6 50 A 15 15 0 0 0 30 30.8 Z"
      />
      {stage >= 2 ? (
        <>
          <circle className="snowman-snow" cx="22" cy="20" r="9" />
          <path
            className="snowman-shade"
            d="M28.2 13.5 A 9 9 0 0 1 17 27.5 A 10.5 10.5 0 0 0 28.2 13.5 Z"
          />
        </>
      ) : null}
      {stage >= 5 ? (
        <>
          <path
            className="snowman-scarf"
            d="M13.6 25.5 Q 22 31 30.4 25.5 L 31.6 28.6 Q 27 31.6 24.6 32 L 25.4 40 L 21 40.6 L 20.6 32.4 Q 16 31.4 12.4 28.6 Z"
          />
          <rect
            className="snowman-hat"
            x="14"
            y="2"
            width="16"
            height="10"
            rx="1"
          />
          <rect
            className="snowman-hat"
            x="11"
            y="10.4"
            width="22"
            height="2.6"
            rx="1.3"
          />
          <rect
            className="snowman-scarf"
            x="14"
            y="8"
            width="16"
            height="2.4"
          />
        </>
      ) : null}
      {stage >= 3 ? (
        <>
          <circle className="snowman-coal" cx="18.6" cy="18" r="1.2" />
          <circle className="snowman-coal" cx="25.4" cy="18" r="1.2" />
          <path className="snowman-nose" d="M21.4 20.4 L30 22.4 L21.4 23.4 Z" />
          <circle className="snowman-coal" cx="22.6" cy="44" r="1.2" />
          <circle className="snowman-coal" cx="22.6" cy="49" r="1.2" />
        </>
      ) : null}
      {/* The snow heaped around its foot. */}
      <ellipse className="snowman-foot" cx="22" cy="55.5" rx="17" ry="4" />
    </svg>
  )
}

/**
 * The night sky behind Today's title: drifting clouds over a navy
 * sky ending in a snowbank in light mode; in dark mode the page itself is the
 * night, so only the clouds remain. It sits under the snow.
 */
export function WinterSky({ tall }: { tall: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn('winter-sky', tall && 'winter-sky-tall')}
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
/** Each swag of the string spans this many units of its box. */
const SWAG = 130

/**
 * A string of lights hung in `swags` sagging loops across a box `swags × 130`
 * wide and 48 tall, with four bulbs along each loop.
 */
function garland(swags: number) {
  const loops = Array.from({ length: swags }, (_, i) => {
    const start = i * SWAG
    return [
      [i === 0 ? start - 5 : start, 7],
      [start + SWAG / 2, i % 2 ? 32 : 30],
      [i === swags - 1 ? start + SWAG + 5 : start + SWAG, 7],
    ] as const
  })
  const width = swags * SWAG
  const path =
    `M${loops[0][0][0]} ${loops[0][0][1]}` +
    loops.map(([, [cx, cy], [x, y]]) => ` Q ${cx} ${cy} ${x} ${y}`).join('')
  const bulbs = loops
    .flatMap(([p0, p1, p2]) =>
      [0.15, 0.38, 0.62, 0.85].map((u) => {
        const k = 1 - u
        return {
          x: k * k * p0[0] + 2 * k * u * p1[0] + u * u * p2[0],
          y: k * k * p0[1] + 2 * k * u * p1[1] + u * u * p2[1],
        }
      }),
    )
    .map((point, index) => ({
      ...point,
      color: BULB_COLORS[index % BULB_COLORS.length],
      // Uneven timing, so the string flickers like real bulbs, not in lockstep.
      delay: (index * 0.37) % 2.6,
      duration: 1.9 + ((index * 0.73) % 1.7),
    }))
  return { width, path, bulbs }
}

// Three loops across a phone; ten across a desktop window.
const PHONE_LIGHTS = garland(3)
const WIDE_LIGHTS = garland(10)

function Lights({
  lights,
  className,
}: {
  lights: ReturnType<typeof garland>
  className: string
}) {
  return (
    <div aria-hidden="true" className={cn('string-lights', className)}>
      <svg viewBox={`0 0 ${lights.width} 48`} preserveAspectRatio="none">
        <path d={lights.path} vectorEffect="non-scaling-stroke" />
      </svg>
      {lights.bulbs.map((bulb, index) => (
        <span
          key={index}
          data-color={bulb.color}
          style={{
            left: `${((bulb.x - 4) / lights.width) * 100}%`,
            top: `${bulb.y + 2}px`,
            animationDelay: `${bulb.delay}s`,
            animationDuration: `${bulb.duration}s`,
          }}
        />
      ))}
    </div>
  )
}

/** A string of twinkling lights across the top of Today. */
export function StringLights() {
  return (
    <>
      <Lights lights={PHONE_LIGHTS} className="md:hidden" />
      <Lights lights={WIDE_LIGHTS} className="hidden md:block" />
    </>
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

const WRAP = {
  cranberry: 'oklch(0.54 0.17 18)',
  gold: 'oklch(0.84 0.14 88)',
  blue: 'oklch(0.6 0.11 240)',
  white: 'oklch(0.97 0.006 250)',
}
/** Left of the trunk, in the tree's units; they stand on its baseline. */
const PRESENTS = [
  { x: -35, y: 58, w: 11, h: 10, box: WRAP.gold, ribbon: WRAP.cranberry },
  { x: -23, y: 52, w: 16, h: 16, box: WRAP.cranberry, ribbon: WRAP.gold },
  { x: -7, y: 57, w: 13, h: 12, box: WRAP.blue, ribbon: WRAP.white },
]

/**
 * A small decorated tree: snowy tiers, twinkling baubles and a gold star,
 * with presents at its foot. The presents are drawn left of its box, so they
 * need that much clear room beside it.
 */
export function ChristmasTree({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 60 72"
      className={cn('christmas-tree', className)}
    >
      <ellipse className="tree-mound" cx="-13" cy="68" rx="27" ry="3.5" />
      <ellipse className="tree-mound" cx="30" cy="67" rx="24" ry="4.5" />
      {PRESENTS.map(({ x, y, w, h, box, ribbon }) => {
        const middle = x + w / 2
        return (
          <g key={x}>
            <rect
              x={x}
              y={y + 3}
              width={w}
              height={h - 3}
              rx="0.8"
              fill={box}
            />
            <rect
              x={x - 1.2}
              y={y}
              width={w + 2.4}
              height="3.8"
              rx="0.8"
              fill={box}
            />
            {/* The lid's shadow on the box. */}
            <rect
              x={x}
              y={y + 3.8}
              width={w}
              height="1"
              fill="oklch(0 0 0 / 18%)"
            />
            <rect x={middle - 1.5} y={y} width="3" height={h} fill={ribbon} />
            <circle cx={middle - 2.2} cy={y - 1} r="2" fill={ribbon} />
            <circle cx={middle + 2.2} cy={y - 1} r="2" fill={ribbon} />
          </g>
        )
      })}
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

/**
 * Snow settled along a card's top edge. Placed by its caller, outside the
 * card, which clips anything on it.
 */
export function SnowLedge({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
      className={cn('snow-ledge pointer-events-none', className)}
    >
      <path d="M2 12 C 0 9, 6 6, 16 6 C 26 3, 44 2, 58 5 C 74 3, 96 4, 110 7 C 128 6, 150 8, 166 7 C 180 3, 204 1, 222 4 C 240 3, 262 5, 276 7 C 296 6, 316 8, 330 6 C 344 2, 366 2, 378 5 C 390 5, 400 8, 398 12 Z" />
    </svg>
  )
}

/**
 * Snow resting on a Log meal button: the phone's round one, or the desktop's
 * pill (`wide`), along its whole top.
 */
export function SnowCap({ wide = false }: { wide?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={wide ? '0 0 120 16' : '0 0 52 16'}
      preserveAspectRatio={wide ? 'none' : undefined}
      // Sized inline: the button sizes every icon inside it to 24px.
      className="snow-cap pointer-events-none absolute -top-1.5 -left-0.5"
      style={
        wide
          ? { width: 'calc(100% + 4px)', height: 14 }
          : { width: 56, height: 18 }
      }
    >
      <path
        d={
          wide
            ? 'M3 15 C 3 9, 8 4, 18 4 C 26 1, 38 1, 46 4 C 56 2, 68 2, 76 4.5 C 86 2, 98 2, 104 5 C 112 5, 117 10, 117 15 C 113 11.5, 106 11, 98 11.5 C 88 12.5, 80 10.5, 70 11 C 60 11.5, 52 12.5, 42 11.5 C 32 10.5, 22 11, 14 11.5 C 9 12, 5 13, 3 15 Z'
            : 'M7.5 14 C 6 9, 12 4.5, 19 4.5 C 24 1, 33 1, 37.5 4.5 C 44 5, 48 10, 45.5 14 C 42 11.5, 37 10, 32 10.3 C 28 11.2, 23 10.4, 19 10.6 C 14 10.8, 10 12, 7.5 14 Z'
        }
      />
    </svg>
  )
}
