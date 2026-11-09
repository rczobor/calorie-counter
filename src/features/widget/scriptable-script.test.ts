import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from './home-screen-widget.messages'
import { widgetScript } from './scriptable-script'

// A minimal stand-in for Scriptable's globals: enough to run the script and
// record what it requested and drew.
function runInScriptable(
  script: string,
  { status, body, family }: { status: number; body: unknown; family: string },
) {
  const requests: Array<{ url: string; headers?: Record<string, string> }> = []
  const texts: string[] = []
  let shown = false
  class Request {
    headers?: Record<string, string>
    response = { statusCode: status }
    constructor(public url: string) {
      requests.push(this)
    }
    loadJSON() {
      // `undefined` stands for a body that isn't JSON, such as an error page.
      return body === undefined
        ? Promise.reject(new SyntaxError('Unexpected token <'))
        : Promise.resolve(body)
    }
  }
  const style = () => ({})
  class ListWidget {
    addText(text: string) {
      texts.push(text)
      return { centerAlignText: () => {} }
    }
    addSpacer() {}
  }
  class Color {
    static dynamic = style
    static white = style
    static black = style
    static red = style
  }
  const Font = new Proxy({}, { get: () => style })
  const run = new Function(
    'Request',
    'ListWidget',
    'Color',
    'Font',
    'config',
    'Script',
    `return (async () => {${script}})()`,
  ) as (...globals: unknown[]) => Promise<void>
  return run(
    Request,
    ListWidget,
    Color,
    Font,
    { runsInWidget: true, widgetFamily: family },
    {
      setWidget: () => (shown = true),
      complete: () => {},
    },
  ).then(() => ({ requests, texts, shown }))
}

const script = widgetScript({
  url: 'https://example.convex.site/widget/today',
  token: 'ccw_secret',
  appUrl: 'https://app.example.test/',
  text: messages.en.script,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Scriptable widget script', () => {
  it("asks for the phone's local date and shows what is left", async () => {
    vi.useFakeTimers({ now: new Date(2026, 3, 4, 23, 30) })
    const result = await runInScriptable(script, {
      status: 200,
      body: { person: 'Alex', remainingCalories: 1549.6, goalKcal: 2000 },
      family: 'small',
    })

    expect(result.requests).toEqual([
      expect.objectContaining({
        url: 'https://example.convex.site/widget/today?date=2026-04-04',
        headers: { Authorization: 'Bearer ccw_secret' },
      }),
    ])
    expect(result.texts).toEqual([
      'Alex',
      '1550',
      'kcal left',
      'Daily goal: 2000 kcal',
    ])
    expect(result.shown).toBe(true)
  })

  it('shows an overrun on the Lock Screen', async () => {
    const result = await runInScriptable(script, {
      status: 200,
      body: { person: 'Alex', remainingCalories: -120, goalKcal: 2000 },
      family: 'accessoryRectangular',
    })
    expect(result.texts).toEqual(['Alex', '120 kcal over'])
  })

  it('shows its own message when the server answers with an error page', async () => {
    const result = await runInScriptable(script, {
      status: 502,
      body: undefined,
      family: 'small',
    })
    expect(result.texts).toEqual(['Couldn’t load today’s calories.'])
  })

  it("shows the server's reason when the widget was removed", async () => {
    const result = await runInScriptable(script, {
      status: 401,
      body: { error: 'This widget was removed. Create a new one in the app.' },
      family: 'small',
    })
    expect(result.texts).toEqual([
      'This widget was removed. Create a new one in the app.',
    ])
    expect(result.shown).toBe(true)
  })
})
