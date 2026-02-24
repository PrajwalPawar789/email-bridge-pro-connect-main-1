import type {
  ConditionClauseConfig,
  ConditionNodeConfig,
  ConditionRule,
} from "@/workflow/types/schema";

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const toConditionRule = (value: unknown): ConditionRule => {
  const normalized = String(value || "").toLowerCase();
  if (
    normalized === "user_property" ||
    normalized === "email_opened" ||
    normalized === "email_clicked" ||
    normalized === "tag_exists" ||
    normalized === "custom_event"
  ) {
    return normalized;
  }
  return "email_opened";
};

const toComparator = (value: unknown): ConditionClauseConfig["comparator"] => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "equals" || normalized === "contains" || normalized === "exists") {
    return normalized;
  }
  return "exists";
};

export const conditionHandleForClause = (index: number) => (index <= 0 ? "if" : `else_if_${index}`);

export const conditionLabelForClause = (index: number) => (index <= 0 ? "If" : `Else If ${index}`);

export const CONDITION_ELSE_HANDLE = "else";

const elseIfIndexFromHandle = (handle: string) => {
  const match = /^else_if_(\d+)$/.exec(handle);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) && index > 0 ? index : null;
};

export const conditionLabelForHandle = (handle: string, fallbackIndex = 0) => {
  if (handle === "if") return "If";
  const elseIfIndex = elseIfIndexFromHandle(handle);
  if (elseIfIndex !== null) return `Else If ${elseIfIndex}`;
  return conditionLabelForClause(fallbackIndex);
};

export const createDefaultConditionClause = (index = 0): ConditionClauseConfig => ({
  id: conditionHandleForClause(index),
  rule: "email_opened",
  comparator: "exists",
  value: "",
});

export const createNextElseIfClause = (existingClauses: ConditionClauseConfig[]) => {
  const usedHandles = new Set(existingClauses.map((clause) => String(clause.id || "")));
  const handle = nextElseIfHandle(usedHandles);
  const index = elseIfIndexFromHandle(handle) || existingClauses.length;
  return createDefaultConditionClause(index);
};

const normalizeClause = (value: unknown, index: number): ConditionClauseConfig => {
  const row = toObject(value);
  const rule = toConditionRule(row.rule);
  const comparator = toComparator(row.comparator);
  const candidateId = String(row.id || "").trim();

  return {
    id: index === 0 ? "if" : candidateId,
    rule,
    propertyKey: String(row.propertyKey || "").trim(),
    comparator,
    value: String(row.value || ""),
  };
};

const nextElseIfHandle = (usedHandles: Set<string>) => {
  let index = 1;
  while (usedHandles.has(`else_if_${index}`)) {
    index += 1;
  }
  return `else_if_${index}`;
};

export const normalizeConditionConfig = (value: unknown): ConditionNodeConfig => {
  const row = toObject(value);
  const rawClauses = Array.isArray(row.clauses) ? row.clauses : [];

  const clauses =
    rawClauses.length > 0
      ? rawClauses.map((clause, index) => normalizeClause(clause, index))
      : [
          normalizeClause(
            {
              rule: row.rule,
              propertyKey: row.propertyKey,
              comparator: row.comparator,
              value: row.value,
            },
            0
          ),
        ];

  const ensuredClauses = clauses.length > 0 ? clauses : [createDefaultConditionClause(0)];
  const normalizedClauses: ConditionClauseConfig[] = [];
  const usedHandles = new Set<string>();

  ensuredClauses.forEach((clause, index) => {
    if (index === 0) {
      normalizedClauses.push({
        ...clause,
        id: "if",
      });
      usedHandles.add("if");
      return;
    }

    const preferredHandle = String(clause.id || "").trim();
    const handle =
      elseIfIndexFromHandle(preferredHandle) !== null && !usedHandles.has(preferredHandle)
        ? preferredHandle
        : nextElseIfHandle(usedHandles);

    normalizedClauses.push({
      ...clause,
      id: handle,
    });
    usedHandles.add(handle);
  });

  return {
    clauses: normalizedClauses,
  };
};

export interface ConditionBranchDefinition {
  handle: string;
  label: string;
  kind: "if" | "else_if" | "else";
  clauseIndex: number | null;
  clause: ConditionClauseConfig | null;
}

export const getConditionBranches = (value: unknown): ConditionBranchDefinition[] => {
  const config = normalizeConditionConfig(value);
  const conditionalBranches = config.clauses.map((clause, index) => ({
    handle: clause.id || conditionHandleForClause(index),
    label: conditionLabelForHandle(clause.id || conditionHandleForClause(index), index),
    kind: (index === 0 ? "if" : "else_if") as "if" | "else_if",
    clauseIndex: index,
    clause,
  }));

  return [
    ...conditionalBranches,
    {
      handle: CONDITION_ELSE_HANDLE,
      label: "Else",
      kind: "else",
      clauseIndex: null,
      clause: null,
    },
  ];
};

export const getConditionBranchLabel = (value: unknown, handle: string) =>
  getConditionBranches(value).find((branch) => branch.handle === handle)?.label;

export const isConditionBranchHandle = (value: unknown, handle: string) =>
  getConditionBranches(value).some((branch) => branch.handle === handle);

export interface ConditionEvaluationContext {
  userProperties?: Record<string, string>;
  opened?: boolean;
  clicked?: boolean;
  tags?: string[];
  customEvents?: string[];
}

export const evaluateConditionClause = (
  clause: ConditionClauseConfig,
  context: ConditionEvaluationContext
): boolean => {
  if (clause.rule === "email_opened") return Boolean(context.opened);
  if (clause.rule === "email_clicked") return Boolean(context.clicked);
  if (clause.rule === "tag_exists") {
    const expected = String(clause.value || "").trim().toLowerCase();
    if (!expected) return false;
    return (context.tags || []).some((tag) => String(tag || "").trim().toLowerCase() === expected);
  }
  if (clause.rule === "custom_event") {
    const expected = String(clause.value || "").trim().toLowerCase();
    if (!expected) return false;
    return (context.customEvents || []).some(
      (eventName) => String(eventName || "").trim().toLowerCase() === expected
    );
  }

  const key = String(clause.propertyKey || "").trim();
  const comparator = clause.comparator || "exists";
  const expected = String(clause.value || "").toLowerCase();
  const current = String((context.userProperties || {})[key] || "").toLowerCase();

  if (comparator === "equals") return key.length > 0 && current === expected;
  if (comparator === "contains") return key.length > 0 && current.includes(expected);
  return key.length > 0 && current.length > 0;
};

export interface ConditionBranchMatch {
  handle: string;
  label: string;
  clauseIndex: number | null;
  matched: boolean;
}

export const pickConditionBranch = (
  value: unknown,
  context: ConditionEvaluationContext
): ConditionBranchMatch => {
  const config = normalizeConditionConfig(value);

  for (let index = 0; index < config.clauses.length; index += 1) {
    const clause = config.clauses[index];
    if (evaluateConditionClause(clause, context)) {
      const handle = clause.id || conditionHandleForClause(index);
      return {
        handle,
        label: conditionLabelForHandle(handle, index),
        clauseIndex: index,
        matched: true,
      };
    }
  }

  return {
    handle: CONDITION_ELSE_HANDLE,
    label: "Else",
    clauseIndex: null,
    matched: false,
  };
};
