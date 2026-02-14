import { Switch } from "@base-ui/react/switch";

type GoalLockSwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function GoalLockSwitch({
  checked,
  onCheckedChange,
}: GoalLockSwitchProps) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card/70 px-3 py-2">
      <span className="text-sm text-foreground/90">
        Lock daily goal after 9 PM
      </span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative inline-flex h-7 w-12 cursor-pointer items-center rounded-full border border-border bg-muted p-1 transition-colors data-checked:border-emerald-900/15 data-checked:bg-emerald-500"
      >
        <Switch.Thumb className="size-5 rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-5" />
      </Switch.Root>
    </label>
  );
}
