import { Check, Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  label: string;
  keywords?: string;
};

type SearchablePickerProps = {
  options: SearchableOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  className?: string;
};

export function SearchablePicker({
  options,
  value,
  onValueChange,
  placeholder = "Search...",
  emptyMessage = "No matches",
  ariaLabel,
  className,
}: SearchablePickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options.slice(0, 40);
    }
    return options
      .filter((option) => {
        const haystack =
          `${option.label} ${option.keywords ?? ""}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 40);
  }, [options, query]);
  const clampedHighlightedIndex =
    filteredOptions.length === 0
      ? -1
      : Math.min(highlightedIndex, filteredOptions.length - 1);
  const highlightedOption =
    clampedHighlightedIndex >= 0
      ? filteredOptions[clampedHighlightedIndex]
      : undefined;

  const selectOption = (nextValue: string) => {
    onValueChange(nextValue);
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      ref={wrapperRef}
      className={cn("w-full min-w-0 space-y-2", className)}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
    >
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
        <Input
          id={inputId}
          value={query}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && highlightedOption
              ? `${listboxId}-option-${highlightedOption.value}`
              : undefined
          }
          aria-label={ariaLabel ?? placeholder}
          onFocus={() => {
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              if (filteredOptions.length > 0) {
                setHighlightedIndex((current) =>
                  Math.min(current + 1, filteredOptions.length - 1),
                );
              }
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (filteredOptions.length > 0) {
                setHighlightedIndex((current) => Math.max(current - 1, 0));
              }
              return;
            }
            if (event.key === "Enter" && open && highlightedOption) {
              event.preventDefault();
              selectOption(highlightedOption.value);
              return;
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>

      {selected ? (
        <div className="flex items-start gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/8 px-2 py-1 text-xs text-foreground dark:border-emerald-400/25 dark:bg-emerald-400/10">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <span className="min-w-0 wrap-break-word">
            Selected:{" "}
            <span className="font-medium" title={selected.label}>
              {selected.label}
            </span>
          </span>
        </div>
      ) : null}

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="bg-popover max-h-56 overflow-auto rounded-md border p-1 shadow-sm"
        >
          {filteredOptions.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1 text-sm">
              {emptyMessage}
            </p>
          ) : (
            filteredOptions.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-option-${option.value}`}
                role="option"
                aria-selected={option.value === value}
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option.value);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                  index === clampedHighlightedIndex &&
                    "bg-accent text-accent-foreground",
                  option.value === value &&
                    "bg-accent/60 text-accent-foreground",
                )}
              >
                <span className="pr-2 wrap-break-word">{option.label}</span>
                {option.value === value ? (
                  <Check className="h-3.5 w-3.5" />
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
