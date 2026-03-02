import { create } from 'zustand';
import { toast } from 'sonner';
import {
  addSiteDomain,
  linkDomainToLandingPage,
  listSiteDomains,
  removeSiteDomain,
  verifySiteDomain,
  type SiteDomainRecord,
  type SiteDomainType,
} from '@/lib/siteConnectorPersistence';

export type ConnectedDomain = SiteDomainRecord;

interface SiteConnectorState {
  domains: ConnectedDomain[];
  hasLoaded: boolean;
  isLoading: boolean;
  isSaving: boolean;
  loadDomains: () => Promise<void>;
  addDomain: (domain: string, type: SiteDomainType) => Promise<void>;
  removeDomain: (id: string) => Promise<void>;
  verifyDomain: (id: string) => Promise<void>;
  linkPage: (domainId: string, pageId: string | null) => Promise<void>;
}

export const useSiteConnectorStore = create<SiteConnectorState>((set, get) => ({
  domains: [],
  hasLoaded: false,
  isLoading: false,
  isSaving: false,

  loadDomains: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const domains = await listSiteDomains();
      set({ domains, hasLoaded: true });
    } catch (error: any) {
      toast.error(error?.message || 'Unable to load domains');
      set({ hasLoaded: true });
    } finally {
      set({ isLoading: false });
    }
  },

  addDomain: async (domain, type) => {
    if (get().isSaving) return;
    set({ isSaving: true });
    try {
      const created = await addSiteDomain(domain, type);
      set((state) => ({ domains: [created, ...state.domains] }));
      toast.success('Domain added');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to add domain');
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },

  removeDomain: async (id) => {
    if (get().isSaving) return;
    set({ isSaving: true });
    try {
      await removeSiteDomain(id);
      set((state) => ({ domains: state.domains.filter((domain) => domain.id !== id) }));
      toast.success('Domain removed');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to remove domain');
    } finally {
      set({ isSaving: false });
    }
  },

  verifyDomain: async (id) => {
    if (get().isSaving) return;
    set({ isSaving: true });
    try {
      const verified = await verifySiteDomain(id);
      set((state) => ({
        domains: state.domains.map((domain) => (domain.id === id ? verified : domain)),
      }));
      if (verified.dnsStatus !== 'verified') {
        toast.error('DNS is not fully configured yet. Update your DNS records and verify again.');
      } else if (verified.sslStatus !== 'active') {
        toast.success('DNS verified. SSL is still provisioning.');
      } else {
        toast.success('Domain verified and SSL active');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Unable to verify domain');
    } finally {
      set({ isSaving: false });
    }
  },

  linkPage: async (domainId, pageId) => {
    if (get().isSaving) return;
    set({ isSaving: true });
    try {
      const updated = await linkDomainToLandingPage(domainId, pageId);
      set((state) => ({
        domains: state.domains.map((domain) => (domain.id === domainId ? updated : domain)),
      }));
      toast.success(pageId ? 'Landing page linked to domain' : 'Domain unlinked');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to update linked landing page');
    } finally {
      set({ isSaving: false });
    }
  },
}));
