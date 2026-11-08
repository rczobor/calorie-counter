import { Select as SelectPrimitive } from '@base-ui/react/select'
import { useMutation, useQuery } from 'convex/react'
import { ChevronRight } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { SelectContent, SelectItem } from '@/components/ui/select'
import {
  applySavedLocale,
  LOCALES,
  useLocale,
  type Locale,
} from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './language-setting.messages'

// Each language is named in itself so anyone can find their own.
const LANGUAGE_NAMES = { en: 'English', hu: 'Magyar' } satisfies Record<
  Locale,
  string
>

/** Applies the signed-in account's language whenever it loads or changes. */
export function AccountLocaleSync() {
  const saved = useQuery(api.userPreferences.getLocale, {})
  useEffect(() => {
    if (saved !== undefined) applySavedLocale(saved)
  }, [saved])
  return null
}

/** The "Language" row in a Settings list. */
export function LanguageSetting() {
  const t = useMessages(messages)
  const locale = useLocale()
  const saved = useQuery(api.userPreferences.getLocale, {})
  const save = useMutation(api.userPreferences.setLocale)

  async function choose(next: Locale) {
    // Switch at once; the account catches up, or the old language returns.
    applySavedLocale(next)
    try {
      await save({ locale: next })
    } catch {
      applySavedLocale(saved ?? null)
      toast.error(t.saveFailed)
    }
  }

  return (
    <SelectPrimitive.Root
      value={locale}
      onValueChange={(value) => {
        if (value && value !== locale) void choose(value)
      }}
    >
      <SelectPrimitive.Trigger
        render={
          <button
            type="button"
            className={cn(LIST_ROW_CLASS, 'justify-between')}
          />
        }
        // The row's name starts with its visible label, for voice control.
        aria-label={`${t.language}: ${LANGUAGE_NAMES[locale]}`}
      >
        <span>{t.language}</span>
        <span className="flex items-center gap-2 text-foreground">
          {LANGUAGE_NAMES[locale]}
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </span>
      </SelectPrimitive.Trigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {LOCALES.map((value) => (
          <SelectItem key={value} value={value} lang={value}>
            {LANGUAGE_NAMES[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}
