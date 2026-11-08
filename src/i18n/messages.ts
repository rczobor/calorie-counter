import { createElement, Fragment, type ReactNode } from 'react'

import { useLocale, type Locale } from './locale'

/**
 * One module's interface text. English sets the shape and every other language
 * must match it, so a missing or extra translation fails type checking.
 * Messages with values are functions, which keeps word order per language.
 */
export function defineMessages<T extends object>(
  messages: { en: T } & Record<Exclude<Locale, 'en'>, NoInfer<T>>,
): Record<Locale, T> {
  return messages
}

/**
 * Text with markup inside it, such as a bold name, for message functions to
 * place per language. Fragment children need no keys.
 */
export function rich(...parts: ReactNode[]) {
  return createElement(Fragment, null, ...parts)
}

export function useMessages<T>(messages: Record<Locale, T>) {
  return messages[useLocale()]
}
