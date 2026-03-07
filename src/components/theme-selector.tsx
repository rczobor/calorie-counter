import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const THEME_OPTIONS = [
  { label: 'Light', value: 'light', icon: Sun },
  { label: 'Dark', value: 'dark', icon: Moon },
  { label: 'System', value: 'system', icon: Monitor },
] as const

const subscribeNoop = () => () => {}

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )

  if (!mounted) {
    return (
      <div
        aria-hidden
        className="h-8 w-24 rounded-full border border-border bg-muted/50 sm:w-39.5"
      />
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selector"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5 sm:gap-1 sm:p-1"
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon
        const isSelected = theme === option.value

        return (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={isSelected ? 'secondary' : 'ghost'}
            aria-label={`Set ${option.label} theme`}
            aria-pressed={isSelected}
            onClick={() => setTheme(option.value)}
            className={cn(
              'min-w-8 rounded-full px-1.5 text-[11px] leading-none sm:min-w-11.5 sm:px-2',
              isSelected && 'shadow-sm',
            )}
          >
            <Icon className="size-3" />
            <span className="hidden sm:inline">{option.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
