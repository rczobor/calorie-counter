import { useEffect, useRef, useSyncExternalStore } from 'react'

/*
 * Snow modelled on iOS Weather, measured from screen recordings with
 * long-exposure frames: many faint distant specks; nearer flakes bigger,
 * brighter and faster (35 to 150 px/s); crisp, irregular grey-white clumps
 * that tumble; each flake on its own slight slant with a small, quick
 * flutter; calm air with rare, gentle gusts. Mid and near flakes now and then
 * settle on the top edge of a card and melt away.
 *
 * It falls behind the page content, so cards cover it and it shows in the
 * gaps. It pauses with the page in the background (animation frames stop),
 * and with reduced motion it is a still scene.
 */

type Layer = {
  kind: 'dot' | 'clump' | 'bokeh'
  /** Flakes in a 390 × 844 phone screen. */
  count: number
  radius: [number, number]
  speed: [number, number]
  alpha: [number, number]
  slant: number
  flutter: [number, number]
  wind: number
  tumble?: boolean
  settle?: boolean
}

const LAYERS: Layer[] = [
  {
    kind: 'dot',
    count: 160,
    radius: [0.45, 0.85],
    speed: [32, 48],
    alpha: [0.12, 0.26],
    slant: 6,
    flutter: [0.3, 0.8],
    wind: 0.3,
  },
  {
    kind: 'dot',
    count: 150,
    radius: [0.8, 1.3],
    speed: [52, 78],
    alpha: [0.28, 0.5],
    slant: 9,
    flutter: [0.5, 1.2],
    wind: 0.5,
  },
  {
    kind: 'clump',
    count: 85,
    radius: [1.5, 2.4],
    speed: [78, 112],
    alpha: [0.5, 0.78],
    slant: 12,
    flutter: [0.8, 1.8],
    wind: 0.8,
    tumble: true,
    settle: true,
  },
  {
    kind: 'clump',
    count: 22,
    radius: [2.6, 4],
    speed: [108, 148],
    alpha: [0.55, 0.85],
    slant: 16,
    flutter: [1, 2.4],
    wind: 1,
    tumble: true,
    settle: true,
  },
  {
    kind: 'bokeh',
    count: 4,
    radius: [5, 8],
    speed: [125, 160],
    alpha: [0.06, 0.13],
    slant: 18,
    flutter: [0, 0],
    wind: 1.2,
  },
]
/** Lighter than the design's "medium", to go easy on a phone's battery. */
const DENSITY = 0.7
const PHONE_AREA = 390 * 844
const VARIANTS = 10
/** Sprite pixels; a flake of radius r is drawn 4r CSS pixels wide. */
const SPRITE = 64
// Sparse: a few flakes resting on a card edge read as snow; dozens read as
// a dotted line.
const MAX_SETTLED = 16
const TAU = Math.PI * 2

type Flake = {
  layer: number
  variant: number
  x: number
  y: number
  r: number
  vy: number
  slant: number
  flutterAmp: number
  flutterHz: number
  flutterPhase: number
  alpha: number
  rotation: number
  spin: number
  tumbleHz: number
  tumblePhase: number
}

type Settled = {
  layer: number
  variant: number
  x: number
  /** In page coordinates, so it stays on its card while the page scrolls. */
  pageY: number
  r: number
  rotation: number
  alpha: number
  born: number
  life: number
}

function between([low, high]: [number, number]) {
  return low + Math.random() * (high - low)
}

/** One irregular polygon: real flakes are jagged clumps, not discs. */
function blob(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const corners = 6 + Math.floor(Math.random() * 4)
  g.beginPath()
  for (let i = 0; i < corners; i++) {
    const angle = (i / corners) * TAU + between([-0.25, 0.25])
    const reach = r * between([0.62, 1])
    const x = cx + Math.cos(angle) * reach
    const y = cy + Math.sin(angle) * reach
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  g.fill()
}

function makeSprite(kind: Layer['kind'], dark: boolean) {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = SPRITE
  const g = sprite.getContext('2d')
  if (!g) return sprite
  const middle = SPRITE / 2
  if (kind === 'bokeh') {
    const glow = g.createRadialGradient(
      middle,
      middle,
      0,
      middle,
      middle,
      middle - 2,
    )
    glow.addColorStop(0, 'rgba(255,255,255,0.8)')
    glow.addColorStop(0.6, 'rgba(255,255,255,0.55)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, SPRITE, SPRITE)
    return sprite
  }
  // On the light page a slate halo keeps white flakes visible; on the night
  // a faint white one only softens the edge.
  g.shadowColor = dark ? 'rgba(240,244,250,0.6)' : 'rgba(70,92,130,0.75)'
  g.shadowBlur = dark ? 2 : 5
  g.fillStyle = 'rgb(236,240,247)'
  if (kind === 'dot') {
    g.beginPath()
    g.arc(middle, middle, 13, 0, TAU)
    g.fill()
    return sprite
  }
  blob(g, middle, middle, between([11, 14]))
  const extra = Math.floor(Math.random() * 3)
  for (let i = 0; i < extra; i++)
    blob(
      g,
      middle + between([-6, 6]),
      middle + between([-6, 6]),
      between([7, 10]),
    )
  return sprite
}

function startSnow(canvas: HTMLCanvasElement, dark: boolean, still: boolean) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  // White flakes on the pale light page need more presence than on the night.
  const visibility = dark ? 1 : 1.35
  const sprites = LAYERS.map((layer) =>
    Array.from({ length: VARIANTS }, () => makeSprite(layer.kind, dark)),
  )
  let width = 0
  let height = 0
  let scale = 1
  function resize() {
    scale = Math.min(2, window.devicePixelRatio || 1)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
  }
  resize()

  // As dense as the phone design on any screen, within reason.
  const density = DENSITY * Math.min(2.5, (width * height) / PHONE_AREA)
  const flakes: Flake[] = LAYERS.flatMap((layer, index) =>
    Array.from({ length: Math.round(layer.count * density) }, () => ({
      layer: index,
      variant: Math.floor(Math.random() * VARIANTS),
      x: Math.random() * width,
      y: between([-20, height]),
      r: between(layer.radius),
      vy: between(layer.speed),
      slant: between([-layer.slant, layer.slant]),
      flutterAmp: between(layer.flutter),
      flutterHz: between([1.4, 3.2]),
      flutterPhase: Math.random() * TAU,
      alpha: between(layer.alpha),
      rotation: Math.random() * TAU,
      spin: between([-1.5, 1.5]),
      tumbleHz: between([0.8, 2.2]),
      tumblePhase: Math.random() * TAU,
    })),
  )
  let settled: Settled[] = []
  /** Top edges of the cards, in page coordinates. */
  let ledges: { left: number; right: number; top: number }[] = []
  const gust = { start: -99, length: 1, peak: 0, next: 0 }
  let started = 0
  let last = 0
  let frames = 0
  let request = 0

  function measureLedges() {
    ledges = Array.from(document.querySelectorAll('.inset-group'))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 80 && rect.height > 0)
      .map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top + window.scrollY,
      }))
  }

  // Calm air with a slow drift; now and then a gentle gust.
  function windAt(t: number) {
    if (t > gust.next) {
      gust.start = t
      gust.length = between([3, 5])
      gust.peak = (Math.random() < 0.5 ? -1 : 1) * between([20, 45])
      gust.next = t + gust.length + between([10, 20])
    }
    const progress = (t - gust.start) / gust.length
    const swell =
      progress >= 0 && progress <= 1 ? Math.sin(Math.PI * progress) ** 2 : 0
    return (
      3 * Math.sin(t * 0.11) + 2 * Math.sin(t * 0.37 + 1) + gust.peak * swell
    )
  }

  function draw(now: number) {
    if (!ctx) return
    const t = now / 1000
    if (!started) {
      started = t
      last = now
      gust.next = t + 8
    }
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (frames++ % 10 === 0) measureLedges()
    const wind = windAt(t)
    // Eases in over a few seconds instead of popping on.
    const ramp = still ? 1 : Math.min(1, (t - started) / 2.5)
    const scrollY = window.scrollY

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Settled flakes lie flat on an edge, then shrink and fade as they melt.
    settled = settled.filter((flake) => t - flake.born < flake.life)
    for (const flake of settled) {
      const age = (t - flake.born) / flake.life
      const fade = age < 0.65 ? 1 : 1 - (age - 0.65) / 0.35
      const size = flake.r * 4 * (0.55 + 0.45 * fade)
      const cos = Math.cos(flake.rotation) * scale
      const sin = Math.sin(flake.rotation) * scale
      ctx.setTransform(
        cos,
        sin,
        -sin * 0.55,
        cos * 0.55,
        flake.x * scale,
        (flake.pageY - scrollY) * scale,
      )
      ctx.globalAlpha = flake.alpha * fade
      ctx.drawImage(
        sprites[flake.layer][flake.variant],
        -size / 2,
        -size / 2,
        size,
        size,
      )
    }

    for (const flake of flakes) {
      const layer = LAYERS[flake.layer]
      if (!still) {
        const before = flake.y
        flake.x += (wind * layer.wind + flake.slant) * dt
        flake.y += flake.vy * dt
        flake.rotation += flake.spin * dt
        if (layer.settle) {
          for (const ledge of ledges) {
            const top = ledge.top - scrollY
            if (
              before < top &&
              flake.y >= top &&
              flake.x > ledge.left + 14 &&
              flake.x < ledge.right - 14
            ) {
              if (Math.random() < 0.06) {
                settled.push({
                  layer: flake.layer,
                  variant: flake.variant,
                  x: flake.x,
                  pageY: ledge.top - flake.r * 0.5,
                  r: flake.r * 0.9,
                  rotation: between([-0.3, 0.3]),
                  alpha: Math.min(1, flake.alpha + 0.15),
                  born: t,
                  life: between([4, 9]),
                })
                if (settled.length > MAX_SETTLED) settled.shift()
                flake.y = -30
                flake.x = Math.random() * width
              }
              break
            }
          }
        }
        if (flake.y > height + 30) {
          flake.y = -30
          flake.x = Math.random() * width
        }
        if (flake.x < -30) flake.x += width + 60
        if (flake.x > width + 30) flake.x -= width + 60
      }

      // The flutter is a small, quick side-to-side wobble on top of the fall.
      const x =
        flake.x +
        flake.flutterAmp *
          Math.sin(TAU * flake.flutterHz * t + flake.flutterPhase)
      const size = flake.r * 4
      if (layer.tumble) {
        // Tumbling clumps foreshorten as they turn.
        const squash =
          0.5 + 0.5 * Math.abs(Math.cos(t * flake.tumbleHz + flake.tumblePhase))
        const cos = Math.cos(flake.rotation) * scale
        const sin = Math.sin(flake.rotation) * scale
        ctx.setTransform(
          cos,
          sin,
          -sin * squash,
          cos * squash,
          x * scale,
          flake.y * scale,
        )
      } else {
        ctx.setTransform(scale, 0, 0, scale, x * scale, flake.y * scale)
      }
      ctx.globalAlpha = Math.min(1, flake.alpha * ramp * visibility)
      ctx.drawImage(
        sprites[flake.layer][flake.variant],
        -size / 2,
        -size / 2,
        size,
        size,
      )
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    if (!still) request = requestAnimationFrame(draw)
  }

  function onResize() {
    resize()
    if (still) draw(performance.now())
  }
  window.addEventListener('resize', onResize)
  request = requestAnimationFrame(draw)
  return () => {
    cancelAnimationFrame(request)
    window.removeEventListener('resize', onResize)
  }
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

// The installed app stays open for days, so a reduced-motion change made
// meanwhile must still stop the snow.
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** Falling snow behind the page, for the winter season. */
export function Snowfall({ dark }: { dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const still = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false,
  )
  useEffect(() => {
    if (!canvas.current) return
    return startSnow(canvas.current, dark, still)
  }, [dark, still])
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="snowfall pointer-events-none fixed inset-0 -z-10 size-full"
    />
  )
}
