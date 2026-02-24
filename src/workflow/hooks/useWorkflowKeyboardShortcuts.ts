import { useEffect } from "react";
import { useWorkflowBuilderStore } from "@/workflow/state/useWorkflowBuilderStore";

interface KeyboardOptions {
  onSave?: () => void;
  enabled?: boolean;
}

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
};

export const useWorkflowKeyboardShortcuts = ({ onSave, enabled = true }: KeyboardOptions) => {
  const undo = useWorkflowBuilderStore((state) => state.undo);
  const redo = useWorkflowBuilderStore((state) => state.redo);
  const removeSelection = useWorkflowBuilderStore((state) => state.removeSelection);
  const copySelection = useWorkflowBuilderStore((state) => state.copySelection);
  const pasteClipboard = useWorkflowBuilderStore((state) => state.pasteClipboard);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (meta && key === "s") {
        event.preventDefault();
        onSave?.();
        return;
      }

      if (meta && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((meta && key === "y") || (meta && event.shiftKey && key === "z")) {
        event.preventDefault();
        redo();
        return;
      }

      if (meta && key === "c" && !isTypingTarget(event.target)) {
        event.preventDefault();
        copySelection();
        return;
      }

      if (meta && key === "v" && !isTypingTarget(event.target)) {
        event.preventDefault();
        pasteClipboard();
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && !isTypingTarget(event.target)) {
        event.preventDefault();
        removeSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelection, enabled, onSave, pasteClipboard, redo, removeSelection, undo]);
};
