import { describe, expect, it } from 'vitest'
import {
  MEAL_CARD_URI,
  RETIRED_MEAL_CARD_URIS,
  mealCardHtml,
} from './mcpMealCard'

type Message = { id?: number; method?: string; params?: unknown }

// Runs the card's script against its own parsed document and a stand-in
// window whose parent is the host, so each test gets a fresh, isolated card.
function openCard({ lang = '' } = {}) {
  const document = new DOMParser().parseFromString(mealCardHtml, 'text/html')
  document.documentElement.lang = lang
  const script = document.querySelector('script')!.textContent
  const sent: Message[] = []
  const listeners: Array<(event: { source: unknown; data: unknown }) => void> =
    []
  const window = {
    addEventListener: (_: string, listener: (typeof listeners)[number]) =>
      listeners.push(listener),
    parent: { postMessage: (message: Message) => sent.push(message) },
  }
  class ResizeObserver {
    observe() {}
  }
  new Function('window', 'document', 'ResizeObserver', script)(
    window,
    document,
    ResizeObserver,
  )
  const fromHost = (message: object) => {
    for (const listener of listeners)
      listener({ source: window.parent, data: { jsonrpc: '2.0', ...message } })
  }
  const card = () => document.getElementById('card')!
  return { document, sent, fromHost, card }
}

const preview = {
  input: { personId: 'p', eatenOn: '2026-11-26', name: 'Lunch', items: [] },
  totalCalories: 640.4,
  macros: { proteinG: 41.6, carbsG: 60.2, fatG: 18, coveredCalories: 640 },
  dailySummary: { consumedCalories: 900, goalKcal: 2100 },
  projectedDailySummary: {
    person: 'Anna',
    consumedCalories: 1540,
    goalKcal: 2100,
    remainingCalories: 560,
  },
  items: [
    { name: 'Chicken breast', calories: 248 },
    {
      name: '<img src=x onerror="window.hacked=1">',
      calories: 392.4,
      nutritionProvenance: { kind: 'estimate', source: 's', assumptions: 'a' },
      missingMacros: 'Add macros',
    },
  ],
}
const amounts = [
  { value: 150, unit: 'g' },
  { value: 120, unit: 'g' },
]
const juice = { name: 'Orange juice', calories: 110 }

describe('meal card', () => {
  it('has a new URI for each change, and the earlier ones stay served', () => {
    // Changing the card changes its URI: move the URI pinned here into
    // RETIRED_MEAL_CARD_URIS, then pin the new one.
    expect(MEAL_CARD_URI).toBe('ui://calorie-counter/meal-card-9b04f7.html')
    expect(RETIRED_MEAL_CARD_URIS).not.toContain(MEAL_CARD_URI)
  })

  it('joins the host, takes its theme and language, and shows the preview as text', async () => {
    const { document, sent, fromHost, card } = openCard()
    expect(card().textContent).toBe('Loading…')
    const initialize = sent.find(
      (message) => message.method === 'ui/initialize',
    )
    expect(initialize).toMatchObject({
      params: { protocolVersion: '2026-01-26' },
    })

    fromHost({
      id: initialize!.id,
      result: { hostContext: { theme: 'dark', locale: 'hu-HU' } },
    })
    await Promise.resolve()
    expect(sent.map((message) => message.method)).toContain(
      'ui/notifications/initialized',
    )
    expect(document.documentElement.dataset.theme).toBe('dark')

    fromHost({
      method: 'ui/notifications/tool-result',
      params: {
        content: [],
        structuredContent: { ...preview, items: [...preview.items, juice] },
        _meta: { amounts: [...amounts, { value: 250, unit: 'ml' }] },
      },
    })
    const rows = [...card().querySelectorAll('li')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    )
    expect(card().querySelector('h1')!.textContent).toBe('Lunch')
    expect(card().querySelector('.subtitle')!.textContent).toBe(
      'Anna · nov. 26., csütörtök',
    )
    expect(rows).toEqual([
      ['Chicken breast', '150 g', '248'],
      [
        '<img src=x onerror="window.hacked=1">BecsültNincs makró',
        '120 g',
        '392',
      ],
      ['Orange juice', '250 ml', '110'],
    ])
    expect(card().querySelector('img')).toBeNull()
    expect(card().querySelector('.macros')!.textContent).toBe(
      'Fehérje 42 g · Szénhidrát 60 g · Zsír 18 g',
    )
    expect(card().querySelector('.day-line')!.textContent).toBe(
      '1540 / 2100 kcal560 kcal maradt',
    )
  })

  it('takes the language from <html lang> when the host sends no locale', async () => {
    const { sent, fromHost, card } = openCard({ lang: 'hu-HU' })
    expect(card().textContent).toBe('Betöltés…')
    fromHost({ id: sent[0].id, result: { hostContext: { theme: 'light' } } })
    await Promise.resolve()
    fromHost({
      method: 'ui/notifications/tool-result',
      params: { structuredContent: preview },
    })
    expect(card().querySelector('.remaining')!.textContent).toBe(
      '560 kcal maradt',
    )
  })

  it('says how far a preview goes over the goal, and when the preview failed', () => {
    const { fromHost, card } = openCard()
    fromHost({
      method: 'ui/notifications/tool-result',
      params: {
        structuredContent: {
          ...preview,
          projectedDailySummary: {
            ...preview.projectedDailySummary,
            consumedCalories: 2220,
            remainingCalories: -120,
          },
        },
      },
    })
    expect(card().querySelector('.remaining')!.textContent).toBe(
      '120 kcal over',
    )

    fromHost({
      method: 'ui/notifications/tool-result',
      params: { isError: true, content: [{ type: 'text', text: 'No person' }] },
    })
    expect(card().textContent).toBe('Something went wrong')
  })
})
