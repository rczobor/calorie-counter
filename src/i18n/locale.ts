import { useSyncExternalStore } from 'react'

export const LOCALES = ['en', 'hu'] as const
export type Locale = (typeof LOCALES)[number]

// The tags drive every Intl date and number. English keeps the browser's
// English region when it has one ("8 Nov" in en-GB), else US conventions.
const INTL_LOCALES = {
  en: () =>
    (typeof navigator === 'undefined'
      ? undefined
      : navigator.languages.find((tag) => /^en-/i.test(tag))) ?? 'en-US',
  hu: () => 'hu-HU',
} satisfies Record<Locale, () => string>

// Mirrors the account's choice so a returning user starts in it before the
// account loads. Absent means the account follows the browser.
const STORAGE_KEY = 'locale'

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value)
}

export function intlLocale(locale: Locale) {
  return INTL_LOCALES[locale]()
}

/** The first browser language the app speaks, or English. */
export function detectBrowserLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const language = tag.split('-')[0].toLowerCase()
    if (isLocale(language)) return language
  }
  return 'en'
}

// undefined until read: the store is created during prerendering, which has
// no browser storage.
let savedLocale: Locale | null | undefined
const listeners = new Set<() => void>()

function readSavedLocale() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch {
    return null
  }
}

function getSavedLocale() {
  if (savedLocale === undefined) savedLocale = readSavedLocale()
  return savedLocale
}

function getLocale(): Locale {
  return getSavedLocale() ?? detectBrowserLocale(navigator.languages)
}

// The prerendered shell is English; the browser switches after hydration.
const getServerLocale = (): Locale => 'en'

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, getServerLocale)
}

/** Applies the account's language; null follows the browser again. */
export function applySavedLocale(locale: Locale | null) {
  if (locale === getSavedLocale()) return
  savedLocale = locale
  try {
    if (locale) localStorage.setItem(STORAGE_KEY, locale)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Without storage the choice still applies until the page closes.
  }
  for (const listener of listeners) listener()
}
