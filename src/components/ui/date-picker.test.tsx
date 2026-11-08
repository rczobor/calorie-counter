// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { Calendar } from '@/components/ui/calendar'
import { DatePicker } from '@/components/ui/date-picker'
import { applySavedLocale } from '@/i18n/locale'

beforeEach(() => applySavedLocale('hu'))
afterEach(() => {
  cleanup()
  applySavedLocale(null)
})

it('shows the picked date in Hungarian', () => {
  // A past year, so the trigger always includes it.
  render(<DatePicker value="2025-12-26" onChange={() => undefined} />)

  const trigger = screen.getByRole('button', { name: 'Válassz dátumot' })
  expect(trigger.textContent).toBe('2025. dec. 26., péntek')
})

// The picker loads the calendar lazily; rendering it directly keeps this
// independent of how long that import takes.
it('starts the Hungarian calendar on Monday', () => {
  render(<Calendar mode="single" />)

  // DayPicker hides the weekday row from assistive technology.
  const weekdays = screen.getAllByRole('columnheader', { hidden: true })
  expect(weekdays[0].getAttribute('aria-label')).toBe('hétfő')
})
