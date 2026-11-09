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
  // The ring's strokes, as "hex/alpha" in drawing order.
  const ring: string[] = []
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
  class Stack {
    addText(text: string) {
      texts.push(text)
      return { centerAlignText: () => {} }
    }
    addSpacer() {}
    addStack() {
      return new Stack()
    }
    addImage() {
      return {}
    }
    topAlignContent() {}
    centerAlignContent() {}
    layoutVertically() {}
  }
  class ListWidget extends Stack {}
  class Color {
    static dynamic = style
    static white = style
    static black = style
    constructor(
      public hex: string,
      public alpha = 1,
    ) {}
  }
  class DrawContext {
    stroke = ''
    setStrokeColor(color: Color) {
      this.stroke = `${color.hex}/${color.alpha}`
    }
    strokePath() {
      ring.push(this.stroke)
    }
    strokeEllipse() {
      ring.push(this.stroke)
    }
    addPath() {}
    setLineWidth() {}
    setFillColor() {}
    fillEllipse() {}
    getImage() {
      return {}
    }
  }
  class Point {
    constructor(
      public x: number,
      public y: number,
    ) {}
  }
  class Path {
    addLines() {}
  }
  class Size {}
  class Rect {}
  const Font = new Proxy({}, { get: () => style })
  const run = new Function(
    'Request',
    'ListWidget',
    'Color',
    'Font',
    'DrawContext',
    'Point',
    'Path',
    'Size',
    'Rect',
    'config',
    'Script',
    `return (async () => {${script}})()`,
  ) as (...globals: unknown[]) => Promise<void>
  return run(
    Request,
    ListWidget,
    Color,
    Font,
    DrawContext,
    Point,
    Path,
    Size,
    Rect,
    { runsInWidget: true, widgetFamily: family },
    {
      setWidget: () => (shown = true),
      complete: () => {},
    },
  ).then(() => ({ requests, texts, ring, shown }))
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
      body: {
        person: 'Alex',
        consumedCalories: 450.4,
        remainingCalories: 1549.6,
        goalKcal: 2000,
      },
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
    // Under the goal: the grey track, then teal for what is left.
    expect(result.ring).toEqual(['#8e8e93/0.4', '#22a39e/1'])
    expect(result.shown).toBe(true)
  })

  it('turns the ring berry when over, with an arc for the overage', async () => {
    const result = await runInScriptable(script, {
      status: 200,
      body: {
        person: 'Alex',
        consumedCalories: 2400,
        remainingCalories: -400,
        goalKcal: 2000,
      },
      family: 'small',
    })
    expect(result.texts).toContain('kcal over')
    expect(result.ring).toEqual(['#c4537a/0.4', '#c4537a/1'])
  })

  it('shows an overrun on the Lock Screen', async () => {
    const result = await runInScriptable(script, {
      status: 200,
      body: {
        person: 'Alex',
        consumedCalories: 2120,
        remainingCalories: -120,
        goalKcal: 2000,
      },
      family: 'accessoryRectangular',
    })
    expect(result.texts).toEqual([
      'Alex',
      '120 kcal over',
      'Daily goal: 2000 kcal',
    ])
  })

  it('names the person in the inline Lock Screen line, beside the date', async () => {
    const result = await runInScriptable(script, {
      status: 200,
      body: {
        person: 'Alex',
        consumedCalories: 1196,
        remainingCalories: 804,
        goalKcal: 2000,
      },
      family: 'accessoryInline',
    })
    expect(result.texts).toEqual(['Alex 804 kcal left'])
  })

  it('signs the overage in the round Lock Screen gauge, where colour is gone', async () => {
    const under = await runInScriptable(script, {
      status: 200,
      body: {
        person: 'Alex',
        consumedCalories: 1196,
        remainingCalories: 804,
        goalKcal: 2000,
      },
      family: 'accessoryCircular',
    })
    expect(under.texts).toEqual(['804', 'left'])
    const over = await runInScriptable(script, {
      status: 200,
      body: {
        person: 'Alex',
        consumedCalories: 2120,
        remainingCalories: -120,
        goalKcal: 2000,
      },
      family: 'accessoryCircular',
    })
    expect(over.texts).toEqual(['+120', 'over'])
    // One tint: the same faint track and bright arc as under.
    expect(over.ring).toEqual(['#ffffff/0.3', '#ffffff/1'])
    // A figure that doesn't fit the ring is left out, not forced in.
    const far = await runInScriptable(script, {
      status: 200,
      body: {
        person: 'Alex',
        consumedCalories: 3240,
        remainingCalories: -1240,
        goalKcal: 2000,
      },
      family: 'accessoryCircular',
    })
    expect(far.texts).toEqual(['over'])
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
