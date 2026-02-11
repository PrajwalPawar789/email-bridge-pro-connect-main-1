import React, { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Mail, X } from "lucide-react";
import type { PipelineOpportunity } from "@/lib/pipeline";

export type ActivityEntry = {
  id: string;
  label: string;
  timestamp: string;
};

type FocusField = "owner" | "nextStep" | "value" | "stage";

interface PipelineDetailsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: PipelineOpportunity | null;
  stages: Array<{ id: string; name: string }>;
  activity: ActivityEntry[];
  onUpdate: (payload: Partial<PipelineOpportunity>) => void;
  onViewInbox: () => void;
  isMobile?: boolean;
  focusField?: FocusField;
}

const PanelBody: React.FC<
  Omit<PipelineDetailsPanelProps, "open" | "onOpenChange" | "isMobile">
> = ({ opportunity, stages, activity, onUpdate, onViewInbox, focusField }) => {
  const ownerRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef<HTMLInputElement | null>(null);
  const nextStepRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (opportunity) {
      if (focusField === "value") {
        valueRef.current?.focus();
        return;
      }
      if (focusField === "nextStep") {
        nextStepRef.current?.focus();
        return;
      }
      ownerRef.current?.focus();
    }
  }, [opportunity, focusField]);

  if (!opportunity) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500">
        <Mail className="h-8 w-8 text-slate-300" />
        <p className="mt-3 font-medium text-slate-700">Select an opportunity</p>
        <p className="text-xs text-slate-500">Details and activity appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{opportunity.contactName}</p>
            <p className="text-xs text-slate-500">{opportunity.company || opportunity.email}</p>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">
            {opportunity.status}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Last activity {formatDistanceToNow(new Date(opportunity.lastActivityAt), { addSuffix: true })}</span>
          {opportunity.value && <span>· ${opportunity.value.toLocaleString()}</span>}
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex-1">
        <TabsList className="mx-4 mt-3 w-[calc(100%-2rem)]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 px-4 pb-6 pt-4">
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-2">
              <Label className="text-xs text-slate-500">Stage</Label>
              <Select
                value={opportunity.stageId}
                onValueChange={(value) => onUpdate({ stageId: value })}
              >
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-slate-500">Owner</Label>
              <Input
                ref={ownerRef}
                value={opportunity.owner || ""}
                onChange={(event) => onUpdate({ owner: event.target.value })}
                placeholder="Assign owner"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-slate-500">Value</Label>
              <Input
                ref={valueRef}
                value={opportunity.value ? String(opportunity.value) : ""}
                onChange={(event) => onUpdate({ value: Number(event.target.value) || undefined })}
                placeholder="12000"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-slate-500">Next step</Label>
              <Input
                ref={nextStepRef}
                value={opportunity.nextStep || ""}
                onChange={(event) => onUpdate({ nextStep: event.target.value })}
                placeholder="Send meeting agenda"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-slate-500">Tags</Label>
              <Input placeholder="Add tags" />
            </div>
            <Button variant="outline" onClick={onViewInbox} className="w-full">
              View in Inbox
            </Button>
          </TabsContent>

          <TabsContent value="activity" className="space-y-3">
            {activity.length === 0 ? (
              <p className="text-xs text-slate-500">No activity yet.</p>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <p className="font-medium text-slate-800">{item.label}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </p>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="notes">
            <p className="text-xs text-slate-500">Notes integration placeholder.</p>
          </TabsContent>

          <TabsContent value="emails">
            <p className="text-xs text-slate-500">Inbox activity placeholder.</p>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};

const PipelineDetailsPanel: React.FC<PipelineDetailsPanelProps> = ({
  open,
  onOpenChange,
  opportunity,
  stages,
  activity,
  onUpdate,
  onViewInbox,
  isMobile,
  focusField,
}) => {
  const handleClose = () => {
    onOpenChange(false);
  };

  if (!isMobile && !open) {
    return null;
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[90vh]">
          <DrawerHeader className="flex items-center justify-between">
            <DrawerTitle>Opportunity</DrawerTitle>
            <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </DrawerHeader>
          <div className="h-full overflow-hidden px-2 pb-4">
            <PanelBody
              opportunity={opportunity}
              stages={stages}
              activity={activity}
              onUpdate={onUpdate}
              onViewInbox={onViewInbox}
              focusField={focusField}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white/90">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Opportunity details</p>
        <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close details">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <PanelBody
        opportunity={opportunity}
        stages={stages}
        activity={activity}
        onUpdate={onUpdate}
        onViewInbox={onViewInbox}
        focusField={focusField}
      />
    </aside>
  );
};

export default PipelineDetailsPanel;
