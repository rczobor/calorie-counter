import { Switch } from '@/components/ui/switch'
import {
  SEGMENT_CLASS,
  SEGMENT_LIST_CLASS,
  SegmentedTrack,
} from '@/components/ui/segmented'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './ingredient-line-controls.messages'

type IngredientLineMode = 'ingredient' | 'custom'

type IngredientLineModeToggleProps = {
  value: IngredientLineMode
  onValueChange: (value: IngredientLineMode) => void
  existingLabel?: string
  customLabel?: string
  className?: string
}

export function IngredientLineModeToggle({
  value,
  onValueChange,
  existingLabel,
  customLabel,
  className,
}: IngredientLineModeToggleProps) {
  const t = useMessages(messages)
  return (
    <SegmentedTrack className={cn('w-fit', className)}>
      <div className={SEGMENT_LIST_CLASS}>
        {(
          [
            ['ingredient', existingLabel ?? t.existing],
            ['custom', customLabel ?? t.custom],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value === mode}
            className={SEGMENT_CLASS}
            onClick={() => onValueChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>
    </SegmentedTrack>
  )
}

type CustomIngredientSwitchRowProps = {
  ignoreCalories: boolean
  onIgnoreCaloriesChange: (checked: boolean) => void
  saveToCatalog: boolean
  onSaveToCatalogChange: (checked: boolean) => void
  className?: string
}

export function CustomIngredientSwitchRow({
  ignoreCalories,
  onIgnoreCaloriesChange,
  saveToCatalog,
  onSaveToCatalogChange,
  className,
}: CustomIngredientSwitchRowProps) {
  const t = useMessages(messages)
  return (
    <div
      className={cn(
        'col-span-full flex flex-wrap items-center gap-x-5 gap-y-1 type-subhead text-foreground',
        className,
      )}
    >
      <label className="inline-flex min-h-10 items-center gap-2.5">
        <span>{t.ignoreCalories}</span>
        <Switch
          size="sm"
          checked={ignoreCalories}
          onCheckedChange={(checked) =>
            onIgnoreCaloriesChange(Boolean(checked))
          }
        />
      </label>
      <label className="inline-flex min-h-10 items-center gap-2.5">
        <span>{t.saveToCatalog}</span>
        <Switch
          size="sm"
          checked={saveToCatalog}
          onCheckedChange={(checked) => onSaveToCatalogChange(Boolean(checked))}
        />
      </label>
    </div>
  )
}
