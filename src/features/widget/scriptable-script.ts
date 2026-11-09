export type WidgetScriptText = {
  left: string
  over: string
  /** The Lock Screen ring's caption under its figure: "left" / "over". */
  leftShort: string
  overShort: string
  /** `{goal}` is replaced with the goal in kcal. */
  goal: string
  failed: string
}

/**
 * A Scriptable (iOS) script that draws today's remaining calories. It runs on
 * the phone, so it asks for the phone's own calendar date. Values are embedded
 * with JSON.stringify so quotes in a translation can't break the script.
 */
export function widgetScript({
  url,
  token,
  appUrl,
  text,
}: {
  url: string
  token: string
  appUrl: string
  text: WidgetScriptText
}) {
  return `// Calorie Counter widget for Scriptable.
// This script contains a private key. Don't share it.
const ENDPOINT = ${JSON.stringify(url)}
const TOKEN = ${JSON.stringify(token)}
const APP_URL = ${JSON.stringify(appUrl)}
const TEXT = ${JSON.stringify(text)}

function today() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return \`\${now.getFullYear()}-\${pad(now.getMonth() + 1)}-\${pad(now.getDate())}\`
}

async function loadDay() {
  const request = new Request(\`\${ENDPOINT}?date=\${today()}\`)
  request.headers = { Authorization: \`Bearer \${TOKEN}\` }
  let body
  try {
    body = await request.loadJSON()
  } catch {
    // A proxy or server error page isn't JSON.
    throw new Error(TEXT.failed)
  }
  if (request.response.statusCode !== 200)
    throw new Error(body.error || TEXT.failed)
  return body
}

// A drawn image can't follow light and dark like text can, so the ring uses
// mid tones that read on both widget backgrounds, on translucent tracks.
// Tracks share one recipe: their arc's hue at 40%.
const RING = {
  track: new Color('#8e8e93', 0.4),
  left: new Color('#22a39e'),
  over: new Color('#c4537a'),
  overTrack: new Color('#c4537a', 0.4),
}
// The Lock Screen draws widgets in one vibrant tint where only brightness
// counts, so its ring is white on a faint track. Over keeps the same shape;
// the sign and the word beside it say over (Robi's call, 2026-11-09).
const MONO = {
  track: new Color('#ffffff', 0.3),
  left: new Color('#ffffff'),
  over: new Color('#ffffff'),
  overTrack: new Color('#ffffff', 0.3),
}

// The ring says what the figure says. Under the goal, a teal arc for what is
// left, emptying through the day. Over it, the track turns berry and a berry
// arc grows by how far over, as a share of the goal; even a small overage
// shows as a clear stroke (8% of the ring) rather than a sliver.
function ringImage(consumed, goal, size, width, colors = RING) {
  const ctx = new DrawContext()
  ctx.size = new Size(size, size)
  ctx.opaque = false
  ctx.respectScreenScale = true
  const radius = (size - width) / 2
  const point = (turn) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2
    return new Point(size / 2 + radius * Math.cos(angle), size / 2 + radius * Math.sin(angle))
  }
  const ring = (color) => {
    ctx.setStrokeColor(color)
    ctx.setLineWidth(width)
    ctx.strokeEllipse(new Rect(width / 2, width / 2, size - width, size - width))
  }
  // Scriptable has no arc, so an arc is a fine polyline with round caps.
  const arc = (to, color) => {
    if (to >= 0.999) return ring(color)
    const steps = Math.max(2, Math.ceil(to * 120))
    const points = []
    for (let i = 0; i <= steps; i++) points.push(point((to * i) / steps))
    const path = new Path()
    path.addLines(points)
    ctx.addPath(path)
    ctx.setStrokeColor(color)
    ctx.setLineWidth(width)
    ctx.strokePath()
    ctx.setFillColor(color)
    for (const turn of [0, to]) {
      const center = point(turn)
      ctx.fillEllipse(new Rect(center.x - width / 2, center.y - width / 2, width, width))
    }
  }
  const left = goal > 0 ? (goal - consumed) / goal : -1
  if (left >= 0) {
    ring(colors.track)
    if (left > 0) arc(Math.min(1, left), colors.left)
  } else {
    ring(colors.overTrack)
    arc(Math.min(1, Math.max(0.08, -left)), colors.over)
  }
  return ctx.getImage()
}

const widget = new ListWidget()
widget.url = APP_URL
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
const family = config.widgetFamily || 'small'

try {
  const day = await loadDay()
  const over = day.remainingCalories < 0
  const amount = String(Math.abs(Math.round(day.remainingCalories)))
  const label = over ? TEXT.over : TEXT.left
  // Centres an item: Scriptable lists lead-align, so pad it from both sides.
  const centred = (add) => {
    const row = widget.addStack()
    row.addSpacer()
    const item = add(row)
    row.addSpacer()
    return item
  }
  if (family === 'accessoryCircular') {
    // A gauge like Fitness's Lock Screen ring, with the figure inside. The
    // Lock Screen drops colour, so a sign and a word carry over. The figure
    // shrinks to fit and never wraps.
    widget.addAccessoryWidgetBackground = true
    widget.backgroundImage = ringImage(day.consumedCalories, day.goalKcal, 72, 6, MONO)
    widget.addSpacer()
    // Four characters fit inside the ring; a longer figure isn't forced in,
    // and the ring and the word say it alone.
    const figure = over ? \`+\${amount}\` : amount
    if (figure.length <= 4) {
      const value = centred((row) => row.addText(figure))
      value.font = Font.boldRoundedSystemFont(figure.length < 4 ? 18 : 16)
      value.minimumScaleFactor = 0.75
      value.lineLimit = 1
    }
    const unit = centred((row) => row.addText(over ? TEXT.overShort : TEXT.leftShort))
    unit.font = Font.mediumSystemFont(figure.length <= 4 ? 10 : 13)
    unit.lineLimit = 1
    widget.addSpacer()
  } else if (family === 'accessoryRectangular') {
    const row = widget.addStack()
    row.centerAlignContent()
    const ring = row.addImage(ringImage(day.consumedCalories, day.goalKcal, 46, 6, MONO))
    ring.imageSize = new Size(46, 46)
    row.addSpacer(10)
    const text = row.addStack()
    text.layoutVertically()
    // Fixed gaps and one shrink rule keep the three lines in order when a
    // translation is long.
    const line = (value, font) => {
      const item = text.addText(value)
      item.font = font
      item.minimumScaleFactor = 0.8
      item.lineLimit = 1
      return item
    }
    line(day.person, Font.semiboldSystemFont(14))
    text.addSpacer(1)
    line(\`\${amount} \${label}\`, Font.boldRoundedSystemFont(16))
    text.addSpacer(1)
    line(TEXT.goal.replace('{goal}', String(day.goalKcal)), Font.systemFont(12))
    row.addSpacer()
  } else if (family === 'accessoryInline') {
    // One line beside the date. The name keeps the date's day number from
    // running into the figure ("Mon 9 804").
    widget.addText(\`\${day.person} \${amount} \${label}\`)
  } else {
    widget.backgroundColor = Color.dynamic(Color.white(), new Color('#1c1c1e'))
    const secondary = Color.dynamic(new Color('#6b7280'), new Color('#a1a1aa'))
    // The app's left / over tokens (styles.css), as in the in-app preview.
    const left = Color.dynamic(new Color('#007370'), new Color('#5ad5cb'))
    const overColor = Color.dynamic(new Color('#9d3d59'), new Color('#eea7b6'))
    // The name and the ring share the top row; the figure stays the hero.
    const top = widget.addStack()
    top.topAlignContent()
    // The name in the primary colour, so whose widget it is reads first when
    // several sit side by side.
    const name = top.addText(day.person)
    name.font = Font.semiboldSystemFont(13)
    name.textColor = Color.dynamic(Color.black(), Color.white())
    top.addSpacer()
    // 44pt ring and a 36pt figure keep a full bottom inset in a small widget.
    const ring = top.addImage(ringImage(day.consumedCalories, day.goalKcal, 44, 7))
    ring.imageSize = new Size(44, 44)
    widget.addSpacer()
    const value = widget.addText(amount)
    value.font = Font.boldRoundedSystemFont(36)
    value.minimumScaleFactor = 0.5
    value.textColor = over ? overColor : left
    const unit = widget.addText(label)
    unit.font = Font.mediumSystemFont(14)
    // Left and over share the unit style; the figure, the ring and the word
    // carry the state.
    unit.textColor = secondary
    widget.addSpacer(6)
    const goal = widget.addText(TEXT.goal.replace('{goal}', String(day.goalKcal)))
    goal.font = Font.systemFont(12)
    goal.textColor = secondary
  }
} catch (error) {
  const message = widget.addText(error.message || TEXT.failed)
  message.font = Font.systemFont(12)
}

if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentSmall()
Script.complete()
`
}
