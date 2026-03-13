import { create } from 'zustand';
import { toast } from 'sonner';
import {
  deleteLandingPage,
  listLandingPages,
  saveLandingPage,
  type LandingPageBlock,
  type LandingPageBlockType,
  type LandingPageRecord,
} from '@/lib/landingPagesPersistence';
import { getLandingPageFormPublishError } from '@/lib/landingPageForms';
import { normalizeLandingPageSettings } from '@/lib/landingPageSettings';

export type LPBlockType = LandingPageBlockType;
export type LPBlock = LandingPageBlock;
export type LandingPage = LandingPageRecord;

interface LandingPageState {
  pages: LandingPage[];
  currentPage: LandingPage | null;
  selectedBlockId: string | null;
  previewMode: 'desktop' | 'tablet' | 'mobile';
  hasLoaded: boolean;
  isLoading: boolean;
  isSaving: boolean;
  loadPages: () => Promise<void>;
  setCurrentPage: (p: LandingPage | null) => void;
  addBlock: (block: LPBlock) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, updates: Partial<LPBlock>) => void;
  duplicateBlock: (id: string) => void;
  reorderBlocks: (blocks: LPBlock[]) => void;
  selectBlock: (id: string | null) => void;
  setPreviewMode: (mode: 'desktop' | 'tablet' | 'mobile') => void;
  updatePageField: (field: string, value: any) => void;
  savePage: () => Promise<void>;
  deletePage: (id?: string) => Promise<void>;
  createNewPage: (seed?: Partial<LandingPage>) => void;
}

const defaultPage = (seed?: Partial<LandingPage>): LandingPage => {
  const page = {
    id: crypto.randomUUID(),
    name: '',
    slug: '',
    blocks: [],
    settings: normalizeLandingPageSettings(undefined),
    published: false,
    createdAt: new Date(),
    ...seed,
  } as LandingPage;

  return {
    ...page,
    settings: normalizeLandingPageSettings(page.settings),
  };
};

export const useLandingPageStore = create<LandingPageState>((set, get) => ({
  pages: [],
  currentPage: null,
  selectedBlockId: null,
  previewMode: 'desktop',
  hasLoaded: false,
  isLoading: false,
  isSaving: false,

  loadPages: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const pages = await listLandingPages();
      const currentId = get().currentPage?.id;
      const localCurrent = get().currentPage;
      const refreshedCurrent = currentId
        ? pages.find((page) => page.id === currentId) || null
        : localCurrent;
      set({
        pages,
        currentPage: refreshedCurrent || null,
        hasLoaded: true,
      });
    } catch (error: any) {
      toast.error(error?.message || 'Unable to load landing pages');
      set({ hasLoaded: true });
    } finally {
      set({ isLoading: false });
    }
  },

  setCurrentPage: (p) => set({ currentPage: p, selectedBlockId: null }),

  addBlock: (block) =>
    set((s) => {
      if (!s.currentPage) return s;
      return { currentPage: { ...s.currentPage, blocks: [...s.currentPage.blocks, block] } };
    }),

  removeBlock: (id) =>
    set((s) => {
      if (!s.currentPage) return s;
      return {
        currentPage: { ...s.currentPage, blocks: s.currentPage.blocks.filter((b) => b.id !== id) },
        selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
      };
    }),

  updateBlock: (id, updates) =>
    set((s) => {
      if (!s.currentPage) return s;
      return {
        currentPage: {
          ...s.currentPage,
          blocks: s.currentPage.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        },
      };
    }),

  duplicateBlock: (id) =>
    set((s) => {
      if (!s.currentPage) return s;
      const index = s.currentPage.blocks.findIndex((block) => block.id === id);
      if (index < 0) return s;
      const source = s.currentPage.blocks[index];
      const nextBlock = {
        ...source,
        id: crypto.randomUUID(),
        content: source.content && typeof source.content === 'object' ? JSON.parse(JSON.stringify(source.content)) : {},
        styles: source.styles && typeof source.styles === 'object' ? JSON.parse(JSON.stringify(source.styles)) : {},
      };
      const nextBlocks = [...s.currentPage.blocks];
      nextBlocks.splice(index + 1, 0, nextBlock);
      return {
        currentPage: {
          ...s.currentPage,
          blocks: nextBlocks,
        },
        selectedBlockId: nextBlock.id,
      };
    }),

  reorderBlocks: (blocks) =>
    set((s) => {
      if (!s.currentPage) return s;
      return { currentPage: { ...s.currentPage, blocks } };
    }),

  selectBlock: (id) => set({ selectedBlockId: id }),
  setPreviewMode: (mode) => set({ previewMode: mode }),

  updatePageField: (field, value) =>
    set((s) => {
      if (!s.currentPage) return s;
      return { currentPage: { ...s.currentPage, [field]: value } };
    }),

  savePage: async () => {
    const currentPage = get().currentPage;
    if (!currentPage || get().isSaving) return;

    if (currentPage.published) {
      const invalidFormBlock = currentPage.blocks.find((block) => {
        if (block.type !== 'form') return false;
        return Boolean(getLandingPageFormPublishError(block.content));
      });

      if (invalidFormBlock) {
        const publishError = getLandingPageFormPublishError(invalidFormBlock.content);
        set({ selectedBlockId: invalidFormBlock.id });
        toast.error(publishError);
        return;
      }
    }

    set({ isSaving: true });
    try {
      const saved = await saveLandingPage(currentPage);
      set((state) => {
        const existing = state.pages.findIndex((page) => page.id === saved.id);
        const pages =
          existing >= 0
            ? state.pages.map((page) => (page.id === saved.id ? saved : page))
            : [saved, ...state.pages];
        return {
          pages,
          currentPage: saved,
        };
      });
      toast.success(saved.published ? 'Landing page published' : 'Landing page saved');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to save landing page');
    } finally {
      set({ isSaving: false });
    }
  },

  deletePage: async (id) => {
    const currentPage = get().currentPage;
    const targetId = id || currentPage?.id;
    if (!targetId || get().isSaving) return;

    const isPersisted = get().pages.some((page) => page.id === targetId);
    if (!isPersisted) {
      set((state) => ({
        currentPage: state.currentPage?.id === targetId ? null : state.currentPage,
        selectedBlockId: state.currentPage?.id === targetId ? null : state.selectedBlockId,
      }));
      return;
    }

    set({ isSaving: true });
    try {
      await deleteLandingPage(targetId);
      set((state) => ({
        pages: state.pages.filter((page) => page.id !== targetId),
        currentPage: state.currentPage?.id === targetId ? null : state.currentPage,
        selectedBlockId: state.currentPage?.id === targetId ? null : state.selectedBlockId,
      }));
      toast.success('Landing page deleted');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to delete landing page');
    } finally {
      set({ isSaving: false });
    }
  },

  createNewPage: (seed) => set({ currentPage: defaultPage(seed), selectedBlockId: null }),
}));
