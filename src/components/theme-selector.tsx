import { Select as SelectPrimitive } from '@base-ui/react/select'
import { ChevronRight, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { SelectContent, SelectItem } from '@/components/ui/select'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './theme-selector.messages'

const THEME_OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const

const subscribeNoop = () => () => {}

/**
 * The theme menu: an icon button in the desktop bar, or a full-width
 * "Appearance" row in a Settings list (`row`).
 */
export default function ThemeSelector({ row = false }: { row?: boolean }) {
  const t = useMessages(messages)
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )

  if (!mounted) {
    return <div aria-hidden className={row ? 'h-12' : 'size-10 rounded-full'} />
  }

  const selectedOption =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2]
  const Icon = selectedOption.icon
  const selectedLabel = t[selectedOption.value]

  return (
    <SelectPrimitive.Root
      value={selectedOption.value}
      onValueChange={(value) => {
        if (value) setTheme(value)
      }}
    >
      <SelectPrimitive.Trigger
        render={
          row ? (
            <button
              type="button"
              className={cn(
                'flex min-h-12 w-full items-center justify-between gap-3 py-2 pr-3.5 pl-4 text-left text-base transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              )}
            />
          ) : (
            <Button variant="ghost" size="icon-sm" />
          )
        }
        // The row's name starts with its visible label, for voice control.
        aria-label={
          row ? t.appearanceValue(selectedLabel) : t.theme(selectedLabel)
        }
        title={row ? undefined : t.theme(selectedLabel)}
      >
        {row ? (
          <>
            <span>{t.appearance}</span>
            {/* The current value reads as content; the row ends on the same
                muted chevron as every other row that opens something. */}
            <span className="flex items-center gap-2 text-foreground">
              {selectedLabel}
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </span>
          </>
        ) : (
          <Icon aria-hidden="true" />
        )}
      </SelectPrimitive.Trigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {THEME_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <option.icon aria-hidden="true" />
            {t[option.value]}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}
