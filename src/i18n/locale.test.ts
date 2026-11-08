import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { applySavedLocale, detectBrowserLocale, useLocale } from './locale'

afterEach(() => applySavedLocale(null))

describe('interface language', () => {
  it('takes the first browser language the app speaks, else English', () => {
    expect(detectBrowserLocale(['hu-HU', 'en-US'])).toBe('hu')
    expect(detectBrowserLocale(['de-DE', 'HU'])).toBe('hu')
    expect(detectBrowserLocale(['en-GB', 'hu'])).toBe('en')
    expect(detectBrowserLocale(['de-DE'])).toBe('en')
    expect(detectBrowserLocale([])).toBe('en')
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
