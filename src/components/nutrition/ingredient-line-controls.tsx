import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

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
  existingLabel = 'Existing',
  customLabel = 'New',
  className,
}: IngredientLineModeToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex rounded-xl border border-border/80 bg-muted/35 p-1',
        className,
      )}
    >
      {(
        [
          ['ingredient', existingLabel],
          ['custom', customLabel],
        ] as const
      ).map(([mode, label]) => (
        <Toggle
          key={mode}
          variant="default"
          size="lg"
          pressed={value === mode}
          onPressedChange={(pressed) => {
            if (pressed) {
              onValueChange(mode)
            }
          }}
          className="h-8 rounded-lg px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-xs"
        >
          {label}
        </Toggle>
      ))}
    </div>
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
  return (
    <label
      className={cn(
        'col-span-full flex items-center gap-3 text-xs text-muted-foreground',
        className,
      )}
    >
      Ignore calories
      <Switch
        size="sm"
        checked={ignoreCalories}
        onCheckedChange={(checked) => onIgnoreCaloriesChange(Boolean(checked))}
      />
      Save to ingredient catalog
      <Switch
        size="sm"
        checked={saveToCatalog}
        onCheckedChange={(checked) => onSaveToCatalogChange(Boolean(checked))}
      />
    </label>
  )
}
