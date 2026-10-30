import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { SelectContent, SelectItem } from '@/components/ui/select'

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
    return <div aria-hidden className="size-9 rounded-md" />
  }

  const selectedOption =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2]
  const Icon = selectedOption.icon

  return (
    <SelectPrimitive.Root
      value={selectedOption.value}
      onValueChange={(value) => {
        if (value) setTheme(value)
      }}
    >
      <SelectPrimitive.Trigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={`Theme: ${selectedOption.label}`}
        title={`Theme: ${selectedOption.label}`}
      >
        <Icon aria-hidden="true" />
      </SelectPrimitive.Trigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {THEME_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <option.icon aria-hidden="true" />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}
