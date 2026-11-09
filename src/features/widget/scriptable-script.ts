export type WidgetScriptText = {
  left: string
  over: string
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

const widget = new ListWidget()
widget.url = APP_URL
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
const family = config.widgetFamily || 'small'

try {
  const day = await loadDay()
  const over = day.remainingCalories < 0
  const amount = String(Math.abs(Math.round(day.remainingCalories)))
  const label = over ? TEXT.over : TEXT.left
  if (family === 'accessoryCircular') {
    const value = widget.addText(amount)
    value.font = Font.boldRoundedSystemFont(16)
    value.minimumScaleFactor = 0.5
    value.centerAlignText()
    const unit = widget.addText('kcal')
    unit.font = Font.systemFont(10)
    unit.centerAlignText()
  } else if (family.startsWith('accessory')) {
    widget.addText(day.person).font = Font.semiboldSystemFont(13)
    widget.addText(\`\${amount} \${label}\`).font = Font.systemFont(13)
  } else {
    widget.backgroundColor = Color.dynamic(Color.white(), new Color('#1c1c1e'))
    const secondary = Color.dynamic(new Color('#6b7280'), new Color('#a1a1aa'))
    // The app's left / over tokens (styles.css), as in the in-app preview.
    const left = Color.dynamic(new Color('#007370'), new Color('#5ad5cb'))
    const overColor = Color.dynamic(new Color('#9d3d59'), new Color('#eea7b6'))
    const name = widget.addText(day.person)
    name.font = Font.semiboldSystemFont(13)
    name.textColor = secondary
    widget.addSpacer()
    const value = widget.addText(amount)
    value.font = Font.boldRoundedSystemFont(40)
    value.minimumScaleFactor = 0.5
    value.textColor = over ? overColor : left
    const unit = widget.addText(label)
    unit.font = Font.mediumSystemFont(14)
    unit.textColor = over ? overColor : secondary
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
