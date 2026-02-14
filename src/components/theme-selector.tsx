import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const THEME_OPTIONS = [
  { label: "Light", value: "light", icon: Sun },
  { label: "Dark", value: "dark", icon: Moon },
  { label: "System", value: "system", icon: Monitor },
] as const;

const subscribeNoop = () => () => {};

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  if (!mounted) {
    return (
      <div
        aria-hidden
        className="h-8 w-39.5 rounded-md border border-border bg-muted/40 dark:border-white/10 dark:bg-slate-900/70"
      />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selector"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background/80 p-1 dark:border-white/10 dark:bg-slate-900/70"
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = theme === option.value;

        return (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={isSelected ? "secondary" : "ghost"}
            aria-pressed={isSelected}
            onClick={() => setTheme(option.value)}
            className={cn(
              "min-w-11.5 rounded-sm px-2 text-[11px] leading-none dark:text-slate-100",
              isSelected &&
                "shadow-sm dark:bg-slate-800/90 dark:text-amber-100 dark:shadow-[0_10px_24px_-16px_rgba(245,158,11,0.65)]",
            )}
          >
            <Icon className="size-3" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
