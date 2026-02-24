import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AutomationDependencyData } from "@/lib/automations";
import { nodePluginMap } from "@/workflow/nodes/nodeRegistry";
import type { WorkflowNode } from "@/workflow/types/schema";
import {
  conditionLabelForHandle,
  createDefaultConditionClause,
  createNextElseIfClause,
  normalizeConditionConfig,
} from "@/workflow/utils/condition";

interface WorkflowInspectorProps {
  node: WorkflowNode | null;
  dependencies: AutomationDependencyData;
  onChangeTitle: (value: string) => void;
  onChangeStatus: (value: WorkflowNode["status"]) => void;
  onPatchConfig: (patch: Record<string, unknown>) => void;
  onTestSend: () => void;
  compact?: boolean;
}

const statusOptions: Array<WorkflowNode["status"]> = ["draft", "live", "error"];

const WorkflowInspector = ({
  node,
  dependencies,
  onChangeTitle,
  onChangeStatus,
  onPatchConfig,
  onTestSend,
  compact = false,
}: WorkflowInspectorProps) => {
  const [emailEditorMode, setEmailEditorMode] = useState<"compose" | "preview">("compose");

  if (!node) {
    return (
      <aside className={cn("h-full bg-white", compact ? "rounded-xl p-3" : "rounded-2xl border border-slate-200 p-4 shadow-sm")}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Inspector</p>
        <p className="mt-4 text-sm text-slate-600">Select a node to edit settings, status, and runtime behavior.</p>
      </aside>
    );
  }

  const plugin = nodePluginMap[node.kind];
  const config = (node.config || {}) as Record<string, unknown>;
  const conditionConfig = node.kind === "condition" ? normalizeConditionConfig(config) : null;

  const preview =
    node.kind === "send_email"
      ? String(config.body || "")
          .replace(/\{\s*first_name\s*\}/gi, "Avery")
          .replace(/\{\s*company\s*\}/gi, "Acme Inc")
          .replace(/\{\s*sender_name\s*\}/gi, "Jordan")
      : "";

  return (
    <aside
      className={cn(
        "h-full bg-white",
        compact ? "rounded-xl p-3" : "rounded-2xl border border-slate-200 p-3 shadow-sm"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Inspector</p>
          <p className="text-sm font-semibold text-slate-900">{plugin.title}</p>
        </div>
        <Badge variant="secondary" className="capitalize">
          {node.status}
        </Badge>
      </div>

      <div className={cn("overflow-auto pr-1", compact ? "h-[calc(100%-52px)]" : "h-[calc(100%-42px)]")}>
        <div className="space-y-4 pb-6">
          <div className="space-y-2">
            <Label>Node title</Label>
            <Input value={node.title} onChange={(event) => onChangeTitle(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={node.status} onValueChange={(value) => onChangeStatus(value as WorkflowNode["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {node.kind === "trigger" ? (
            <div className="space-y-3">
              <Label>Trigger type</Label>
              <Select
                value={String(config.triggerType || "list_joined")}
                onValueChange={(value) => onPatchConfig({ triggerType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="list_joined">Contact enters list</SelectItem>
                  <SelectItem value="manual">Manual enrollment</SelectItem>
                  <SelectItem value="custom_event">Custom event</SelectItem>
                </SelectContent>
              </Select>

              <Label>List</Label>
              <Select
                value={String(config.listId || "__none")}
                onValueChange={(value) => onPatchConfig({ listId: value === "__none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No list</SelectItem>
                  {dependencies.emailLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {String(config.triggerType) === "custom_event" ? (
                <div className="space-y-2">
                  <Label>Event name</Label>
                  <Input
                    value={String(config.eventName || "")}
                    onChange={(event) => onPatchConfig({ eventName: event.target.value })}
                    placeholder="account_activated"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {node.kind === "send_email" ? (
            <div className="space-y-3 pt-1">
              <div className="grid w-full grid-cols-2 rounded-md bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setEmailEditorMode("compose")}
                  className={cn(
                    "h-8 rounded text-xs font-medium transition-colors",
                    emailEditorMode === "compose" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                  )}
                >
                  Compose
                </button>
                <button
                  type="button"
                  onClick={() => setEmailEditorMode("preview")}
                  className={cn(
                    "h-8 rounded text-xs font-medium transition-colors",
                    emailEditorMode === "preview" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                  )}
                >
                  Preview
                </button>
              </div>

              {emailEditorMode === "compose" ? (
                <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Sender</Label>
                  <Select
                    value={String(config.senderConfigId || "__none")}
                    onValueChange={(value) => onPatchConfig({ senderConfigId: value === "__none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Auto sender</SelectItem>
                      {dependencies.emailConfigs.map((sender) => (
                        <SelectItem key={sender.id} value={sender.id}>
                          {sender.sender_name || sender.smtp_username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select
                    value={String(config.templateId || "__none")}
                    onValueChange={(value) => {
                      if (value === "__none") {
                        onPatchConfig({ templateId: "" });
                        return;
                      }
                      const template = dependencies.emailTemplates.find((item) => item.id === value);
                      onPatchConfig({
                        templateId: value,
                        subject: template?.subject || config.subject,
                        body: template?.content || config.body,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No template</SelectItem>
                      {dependencies.emailTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={String(config.subject || "")}
                    onChange={(event) => onPatchConfig({ subject: event.target.value })}
                    placeholder="Subject"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Body</Label>
                  <Textarea
                    className="min-h-[140px]"
                    value={String(config.body || "")}
                    onChange={(event) => onPatchConfig({ body: event.target.value })}
                    placeholder="Hi {first_name}, ..."
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                  Tokens: {Array.isArray(config.personalizationTokens) && config.personalizationTokens.length > 0
                    ? (config.personalizationTokens as string[]).join(", ")
                    : "{first_name}, {company}, {sender_name}"}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
                  <span>Thread with previous email</span>
                  <Switch
                    checked={config.threadWithPrevious !== false}
                    onCheckedChange={(checked) => onPatchConfig({ threadWithPrevious: checked })}
                  />
                </div>
                </div>
              ) : null}

              {emailEditorMode === "preview" ? (
                <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Subject</p>
                  <p className="text-sm text-slate-900">{String(config.subject || "(empty)")}</p>
                  <Separator className="my-2" />
                  <pre className="whitespace-pre-wrap text-xs text-slate-700">{preview || "Email body preview"}</pre>
                </div>
                <Button type="button" onClick={onTestSend} className="w-full">
                  Test send
                </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {node.kind === "wait" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Delay</Label>
                  <Input
                    type="number"
                    min={1}
                    value={String(config.duration || 1)}
                    onChange={(event) => onPatchConfig({ duration: Number(event.target.value || 1) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select value={String(config.unit || "days")} onValueChange={(value) => onPatchConfig({ unit: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Window start</Label>
                  <Input
                    type="time"
                    value={String(config.timeWindowStart || "09:00")}
                    onChange={(event) => onPatchConfig({ timeWindowStart: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Window end</Label>
                  <Input
                    type="time"
                    value={String(config.timeWindowEnd || "18:00")}
                    onChange={(event) => onPatchConfig({ timeWindowEnd: event.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
                <span>Randomized delay</span>
                <Switch
                  checked={config.randomized === true}
                  onCheckedChange={(checked) => onPatchConfig({ randomized: checked })}
                />
              </div>

              {config.randomized ? (
                <div className="space-y-2">
                  <Label>Max random minutes</Label>
                  <Input
                    type="number"
                    min={1}
                    value={String(config.randomMaxMinutes || 60)}
                    onChange={(event) => onPatchConfig({ randomMaxMinutes: Number(event.target.value || 60) })}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {node.kind === "condition" && conditionConfig ? (
            <div className="space-y-3">
              {conditionConfig.clauses.map((clause, index) => {
                const label = conditionLabelForHandle(clause.id, index);
                const isUserProperty = clause.rule === "user_property";
                const requiresValue = clause.rule === "user_property" || clause.rule === "tag_exists" || clause.rule === "custom_event";

                const updateClause = (patch: Record<string, unknown>) => {
                  const nextClauses = conditionConfig.clauses.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          ...patch,
                        }
                      : item
                  );
                  onPatchConfig({ clauses: nextClauses });
                };

                const removeClause = () => {
                  const nextClauses = conditionConfig.clauses.filter((_, itemIndex) => itemIndex !== index);
                  onPatchConfig({ clauses: nextClauses.length > 0 ? nextClauses : [createDefaultConditionClause(0)] });
                };

                return (
                  <div key={`${clause.id}_${index}`} className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</Label>
                      {index > 0 ? (
                        <Button type="button" variant="ghost" size="sm" onClick={removeClause} className="h-7 px-2 text-xs">
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label>Rule</Label>
                      <Select value={clause.rule} onValueChange={(value) => updateClause({ rule: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user_property">User property</SelectItem>
                          <SelectItem value="email_opened">Email opened</SelectItem>
                          <SelectItem value="email_clicked">Email clicked</SelectItem>
                          <SelectItem value="tag_exists">Tag exists</SelectItem>
                          <SelectItem value="custom_event">Custom event</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {isUserProperty ? (
                      <div className="space-y-2">
                        <Label>Property key</Label>
                        <Input
                          value={String(clause.propertyKey || "")}
                          onChange={(event) => updateClause({ propertyKey: event.target.value })}
                          placeholder="company"
                        />

                        <Label>Comparator</Label>
                        <Select value={String(clause.comparator || "contains")} onValueChange={(value) => updateClause({ comparator: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="exists">Exists</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {requiresValue ? (
                      <div className="space-y-2">
                        <Label>{clause.rule === "custom_event" ? "Event name" : "Value"}</Label>
                        <Input
                          value={String(clause.value || "")}
                          onChange={(event) => updateClause({ value: event.target.value })}
                          placeholder={clause.rule === "custom_event" ? "trial_started" : "enterprise"}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onPatchConfig({
                    clauses: [...conditionConfig.clauses, createNextElseIfClause(conditionConfig.clauses)],
                  });
                }}
              >
                Add Else If
              </Button>

              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                Else branch is always available and runs when no condition matches.
              </div>
            </div>
          ) : null}

          {node.kind === "split" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Variant A %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={String(config.percentageA || 50)}
                    onChange={(event) => onPatchConfig({ percentageA: Number(event.target.value || 50) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Variant B %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={String(config.percentageB || 50)}
                    onChange={(event) => onPatchConfig({ percentageB: Number(event.target.value || 50) })}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {node.kind === "webhook" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input
                  value={String(config.url || "")}
                  onChange={(event) => onPatchConfig({ url: event.target.value })}
                  placeholder="https://api.example.com/hooks"
                />
              </div>

              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={String(config.method || "POST")} onValueChange={(value) => onPatchConfig({ method: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payload template</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={String(config.payloadTemplate || "")}
                  onChange={(event) => onPatchConfig({ payloadTemplate: event.target.value })}
                />
              </div>
            </div>
          ) : null}

          {node.kind === "exit" ? (
            <div className="space-y-2">
              <Label>Exit reason</Label>
              <Select value={String(config.reason || "completed")} onValueChange={(value) => onPatchConfig({ reason: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="condition_met">Condition met</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
};

export default WorkflowInspector;
