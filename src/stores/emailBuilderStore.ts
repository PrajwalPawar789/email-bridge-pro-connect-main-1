import { create } from 'zustand';
import { toast } from 'sonner';
import {
  deleteEmailBuilderTemplate,
  listEmailBuilderTemplates,
  saveEmailBuilderTemplate,
  type EmailBuilderBlock,
  type EmailBuilderBlockType,
  type EmailBuilderTemplate,
} from '@/lib/emailBuilderPersistence';

export type BlockType = EmailBuilderBlockType;
export type EmailBlock = EmailBuilderBlock;
export type EmailTemplate = EmailBuilderTemplate;

interface EmailBuilderState {
  templates: EmailTemplate[];
  currentTemplate: EmailTemplate | null;
  selectedBlockId: string | null;
  previewMode: 'desktop' | 'mobile';
  hasLoaded: boolean;
  isLoading: boolean;
  isSaving: boolean;
  loadTemplates: () => Promise<void>;
  setCurrentTemplate: (t: EmailTemplate | null) => void;
  addBlock: (block: EmailBlock) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, updates: Partial<EmailBlock>) => void;
  reorderBlocks: (blocks: EmailBlock[]) => void;
  selectBlock: (id: string | null) => void;
  setPreviewMode: (mode: 'desktop' | 'mobile') => void;
  updateTemplateField: (field: string, value: any) => void;
  saveTemplate: () => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  createNewTemplate: () => void;
}

const defaultTemplate = (): EmailTemplate => ({
  id: crypto.randomUUID(),
  name: '',
  subject: '',
  format: 'html',
  blocks: [],
  audience: 'All',
  voice: 'Professional',
  goal: 'Cold outreach',
  createdAt: new Date(),
});

export const useEmailBuilderStore = create<EmailBuilderState>((set, get) => ({
  templates: [],
  currentTemplate: null,
  selectedBlockId: null,
  previewMode: 'desktop',
  hasLoaded: false,
  isLoading: false,
  isSaving: false,

  loadTemplates: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const templates = await listEmailBuilderTemplates();
      const currentId = get().currentTemplate?.id;
      const refreshedCurrent =
        currentId && templates.find((template) => template.id === currentId)
          ? templates.find((template) => template.id === currentId) || null
          : get().currentTemplate;
      set({
        templates,
        currentTemplate: refreshedCurrent || null,
        hasLoaded: true,
      });
    } catch (error: any) {
      toast.error(error?.message || 'Unable to load templates');
      set({ hasLoaded: true });
    } finally {
      set({ isLoading: false });
    }
  },

  setCurrentTemplate: (t) => set({ currentTemplate: t, selectedBlockId: null }),

  addBlock: (block) =>
    set((s) => {
      if (!s.currentTemplate) return s;
      return {
        currentTemplate: { ...s.currentTemplate, blocks: [...s.currentTemplate.blocks, block] },
      };
    }),

  removeBlock: (id) =>
    set((s) => {
      if (!s.currentTemplate) return s;
      return {
        currentTemplate: { ...s.currentTemplate, blocks: s.currentTemplate.blocks.filter((b) => b.id !== id) },
        selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
      };
    }),

  updateBlock: (id, updates) =>
    set((s) => {
      if (!s.currentTemplate) return s;
      return {
        currentTemplate: {
          ...s.currentTemplate,
          blocks: s.currentTemplate.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        },
      };
    }),

  reorderBlocks: (blocks) =>
    set((s) => {
      if (!s.currentTemplate) return s;
      return { currentTemplate: { ...s.currentTemplate, blocks } };
    }),

  selectBlock: (id) => set({ selectedBlockId: id }),

  setPreviewMode: (mode) => set({ previewMode: mode }),

  updateTemplateField: (field, value) =>
    set((s) => {
      if (!s.currentTemplate) return s;
      return { currentTemplate: { ...s.currentTemplate, [field]: value } };
    }),

  saveTemplate: async () => {
    const currentTemplate = get().currentTemplate;
    if (!currentTemplate) return;
    if (get().isSaving) return;

    set({ isSaving: true });
    try {
      const savedTemplate = await saveEmailBuilderTemplate(currentTemplate);
      set((state) => {
        const existing = state.templates.findIndex((item) => item.id === savedTemplate.id);
        const templates =
          existing >= 0
            ? state.templates.map((item) => (item.id === savedTemplate.id ? savedTemplate : item))
            : [savedTemplate, ...state.templates];
        return {
          templates,
          currentTemplate: savedTemplate,
        };
      });
      toast.success('Template saved');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to save template');
    } finally {
      set({ isSaving: false });
    }
  },

  deleteTemplate: async (id) => {
    try {
      await deleteEmailBuilderTemplate(id);
      set((state) => ({
        templates: state.templates.filter((item) => item.id !== id),
        currentTemplate: state.currentTemplate?.id === id ? null : state.currentTemplate,
        selectedBlockId: state.currentTemplate?.id === id ? null : state.selectedBlockId,
      }));
      toast.success('Template deleted');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to delete template');
    }
  },

  createNewTemplate: () => set({ currentTemplate: defaultTemplate(), selectedBlockId: null }),
}));
