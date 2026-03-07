import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    <Tabs
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === 'ingredient' || nextValue === 'custom') {
          onValueChange(nextValue)
        }
      }}
      className={cn('w-fit', className)}
    >
      <TabsList>
        <TabsTrigger value="ingredient">{existingLabel}</TabsTrigger>
        <TabsTrigger value="custom">{customLabel}</TabsTrigger>
      </TabsList>
    </Tabs>
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
