import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applySavedLocale,
  detectBrowserLocale,
  intlLocale,
  useLocale,
} from './locale'

afterEach(() => {
  applySavedLocale(null)
  vi.restoreAllMocks()
})

describe('interface language', () => {
  it('takes the first browser language the app speaks, else English', () => {
    expect(detectBrowserLocale(['hu-HU', 'en-US'])).toBe('hu')
    expect(detectBrowserLocale(['de-DE', 'HU'])).toBe('hu')
    expect(detectBrowserLocale(['en-GB', 'hu'])).toBe('en')
    expect(detectBrowserLocale(['de-DE'])).toBe('en')
    expect(detectBrowserLocale([])).toBe('en')
  })

  it('formats English in the browser’s English region, else as in the US', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get')
    languages.mockReturnValue(['de-DE', 'en-GB'])
    expect(intlLocale('en')).toBe('en-GB')
    languages.mockReturnValue(['hu-HU', 'en'])
    expect(intlLocale('en')).toBe('en-US')
    expect(intlLocale('hu')).toBe('hu-HU')
  })

  it('applies and remembers the account’s choice, and follows the browser without one', () => {
    const { result } = renderHook(() => useLocale())
    expect(result.current).toBe('en')

    act(() => applySavedLocale('hu'))
    expect(result.current).toBe('hu')
    expect(localStorage.getItem('locale')).toBe('hu')

    act(() => applySavedLocale(null))
    expect(result.current).toBe('en')
    expect(localStorage.getItem('locale')).toBeNull()
  })
})
