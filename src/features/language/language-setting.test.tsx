import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySavedLocale, useLocale } from '@/i18n/locale'
import { AccountLocaleSync, LanguageSetting } from './language-setting'

const { save, toastError } = vi.hoisted(() => ({
  save: vi.fn(),
  toastError: vi.fn(),
}))
let accountLocale: 'en' | 'hu' | null | undefined = null
vi.mock('convex/react', () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === 'userPreferences:getLocale'
      ? accountLocale
      : undefined,
  useMutation: () => save,
}))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

async function pick(trigger: RegExp, language: string) {
  fireEvent.click(screen.getByRole('combobox', { name: trigger }))
  const option = await screen.findByRole('option', { name: language })
  fireEvent.pointerDown(option, { button: 0 })
  fireEvent.pointerUp(option, { button: 0 })
  fireEvent.click(option)
}

function CurrentLocale() {
  return <output>{useLocale()}</output>
}

beforeEach(() => {
  accountLocale = null
  save.mockReset()
  toastError.mockReset()
})
afterEach(() => {
  cleanup()
  applySavedLocale(null)
})

describe('language setting', () => {
  it('switches at once and saves the choice on the account', async () => {
    save.mockResolvedValue(null)
    render(<LanguageSetting />)

    await pick(/^Language: English/, 'Magyar')

    await waitFor(() => expect(save).toHaveBeenCalledWith({ locale: 'hu' }))
    expect(screen.getByRole('combobox', { name: 'Nyelv: Magyar' })).toBeTruthy()
  })

  it('returns to the saved language when the account cannot store the choice', async () => {
    // Saved Hungarian on an English browser, so a revert to the browser's
    // language would show English.
    accountLocale = 'hu'
    applySavedLocale('hu')
    save.mockRejectedValue(new Error('offline'))
    render(<LanguageSetting />)

    await pick(/^Nyelv: Magyar/, 'English')

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Nem sikerült menteni a nyelvet. Próbáld újra.',
      ),
    )
    expect(screen.getByRole('combobox', { name: 'Nyelv: Magyar' })).toBeTruthy()
  })

  it('applies the account’s language once it loads', () => {
    accountLocale = undefined
    const { rerender } = render(
      <>
        <AccountLocaleSync />
        <CurrentLocale />
      </>,
    )
    expect(screen.getByRole('status').textContent).toBe('en')

    accountLocale = 'hu'
    rerender(
      <>
        <AccountLocaleSync />
        <CurrentLocale />
      </>,
    )
    expect(screen.getByRole('status').textContent).toBe('hu')
  })
})
