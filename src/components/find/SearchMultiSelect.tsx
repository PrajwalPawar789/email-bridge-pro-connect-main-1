import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SearchMultiSelectProps = {
  label: string;
  placeholder: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

const SearchMultiSelect = ({
  label,
  placeholder,
  options,
  selected,
  onChange,
  disabled = false,
}: SearchMultiSelectProps) => {
  const [open, setOpen] = React.useState(false);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  const toggleOption = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((entry) => entry !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            className="text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-900"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-11 w-full justify-between rounded-2xl border-slate-200 bg-white px-3 text-left font-normal text-slate-700 shadow-sm hover:bg-slate-50",
              selected.length === 0 && "text-slate-400",
            )}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}`} />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const checked = selectedSet.has(option);
                  return (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => toggleOption(option)}
                      className="gap-3"
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="flex-1 truncate">{option}</span>
                      {checked && <Check className="h-4 w-4 text-emerald-600" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500">{selected.length} selected</p>
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                <X className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default SearchMultiSelect;
