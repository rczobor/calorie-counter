import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

type IngredientLineMode = "ingredient" | "custom";

type IngredientLineModeToggleProps = {
  value: IngredientLineMode;
  onValueChange: (value: IngredientLineMode) => void;
  existingLabel?: string;
  customLabel?: string;
  className?: string;
};

const ingredientModeToggleClassName =
  "rounded-full border border-transparent px-3 text-muted-foreground transition-colors hover:text-foreground data-[state=on]:border-primary/60 data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]";

export function IngredientLineModeToggle({
  value,
  onValueChange,
  existingLabel = "Existing",
  customLabel = "New",
  className,
}: IngredientLineModeToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex gap-1 rounded-full border border-border/70 bg-muted/40 p-1",
        className,
      )}
    >
      <Toggle
        size="sm"
        variant="default"
        className={ingredientModeToggleClassName}
        pressed={value === "ingredient"}
        onPressedChange={(pressed) => {
          if (pressed) {
            onValueChange("ingredient");
          }
        }}
      >
        {existingLabel}
      </Toggle>
      <Toggle
        size="sm"
        variant="default"
        className={ingredientModeToggleClassName}
        pressed={value === "custom"}
        onPressedChange={(pressed) => {
          if (pressed) {
            onValueChange("custom");
          }
        }}
      >
        {customLabel}
      </Toggle>
    </div>
  );
}

type CustomIngredientSwitchRowProps = {
  ignoreCalories: boolean;
  onIgnoreCaloriesChange: (checked: boolean) => void;
  saveToCatalog: boolean;
  onSaveToCatalogChange: (checked: boolean) => void;
  className?: string;
};

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
        "col-span-full flex items-center gap-3 text-xs text-muted-foreground",
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
  );
}
