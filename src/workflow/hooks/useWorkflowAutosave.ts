import { useEffect, useRef } from "react";
import { useWorkflowBuilderStore } from "@/workflow/state/useWorkflowBuilderStore";

interface AutosaveOptions {
  enabled: boolean;
  delayMs?: number;
  onSave: () => Promise<void> | void;
}

export const useWorkflowAutosave = ({ enabled, delayMs = 1200, onSave }: AutosaveOptions) => {
  const dirty = useWorkflowBuilderStore((state) => state.dirty);
  const revision = useWorkflowBuilderStore((state) => state.revision);

  const timer = useRef<number | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || !dirty) return;

    if (timer.current) {
      window.clearTimeout(timer.current);
    }

    timer.current = window.setTimeout(async () => {
      if (running.current) return;
      running.current = true;
      try {
        await onSave();
      } finally {
        running.current = false;
      }
    }, delayMs);

    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, [delayMs, dirty, enabled, onSave, revision]);
};
