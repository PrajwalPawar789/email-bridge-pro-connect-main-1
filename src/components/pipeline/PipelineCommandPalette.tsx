import React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { LayoutList, LayoutPanelLeft, PieChart, Plus, SlidersHorizontal } from "lucide-react";

interface PipelineCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (action: string) => void;
}

const PipelineCommandPalette: React.FC<PipelineCommandPaletteProps> = ({
  open,
  onOpenChange,
  onSelect,
}) => {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Create">
          <CommandItem onSelect={() => onSelect("new-opportunity")}> 
            <Plus className="mr-2 h-4 w-4" />
            New opportunity
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Views">
          <CommandItem onSelect={() => onSelect("view-board")}>
            <LayoutPanelLeft className="mr-2 h-4 w-4" />
            Board view
            <CommandShortcut>G B</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => onSelect("view-list")}>
            <LayoutList className="mr-2 h-4 w-4" />
            List view
            <CommandShortcut>G L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => onSelect("view-analytics")}>
            <PieChart className="mr-2 h-4 w-4" />
            Analytics view
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Filters">
          <CommandItem onSelect={() => onSelect("toggle-stale")}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Toggle stale only
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default PipelineCommandPalette;
