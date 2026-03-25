import { supabase } from "@/integrations/supabase/client";

export type SearchMode = "prospects" | "companies";

export type ProspectSearchFilters = {
  jobTitle: string;
  companyName: string;
  exactCompanyName: string;
  companyDomain: string;
  naics: string;
  jobLevel: string[];
  jobFunction: string[];
  country: string[];
  industry: string[];
  subIndustry: string[];
  employeeSize: string[];
  region: string[];
};

export type CompanySearchFilters = {
  companyName: string;
  naics: string;
  country: string[];
  region: string[];
  industry: string[];
  subIndustry: string[];
  employeeSize: string[];
};

export type SearchShardStatus = {
  requestedSlots: number;
  configured: number;
  healthy: number;
  failed: number;
  inactive: number;
  warnings: string[];
};

export type ProspectSearchRow = {
  catalogRef: string;
  sourceShard: number;
  sourceRecordId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  jobTitle: string | null;
  jobLevel: string | null;
  jobFunction: string | null;
  companyName: string | null;
  companyDomain: string | null;
  country: string | null;
  region: string | null;
  industry: string | null;
  subIndustry: string | null;
  employeeSize: string | null;
  naics: string | null;
  linkedin: string | null;
};

export type CompanySearchRow = {
  catalogRef: string;
  sourceShard: number;
  sourceRecordId: string;
  companyName: string;
  domain: string | null;
  country: string | null;
  region: string | null;
  industry: string | null;
  subIndustry: string | null;
  employeeSize: string | null;
  naics: string | null;
  prospectCount: number;
};

export type SearchResponse<T> = {
  items: T[];
  nextCursor: string | null;
  totalApprox: number;
  totalIsExact?: boolean;
  shardStatus: SearchShardStatus;
};

export type SearchFilterOptionsResponse = {
  mode: SearchMode;
  options: Record<string, string[]>;
  generatedAt: string;
};

export type SearchDetailResponse<T> = {
  item: T;
  raw: Record<string, unknown>;
  shard: {
    index: number;
    projectRef: string | null;
  };
  warning?: string | null;
};

const getFunctionErrorMessage = async (error: { message?: string; context?: unknown } | null | undefined) => {
  let message = error?.message || "Catalog search request failed.";
  const response = error?.context;

  if (response) {
    try {
      const payload = await (response as Response).json();
      message = payload?.error || payload?.message || message;
    } catch {
      // Keep the function error message when the response body is not JSON.
    }
  }

  return message;
};

const invokeCatalogSearch = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("catalog-search", {
    body,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>).error || "Catalog search request failed."));
  }

  return data as T;
};

export const searchProspects = async (payload: {
  filters: ProspectSearchFilters;
  cursor?: string | null;
  pageSize?: number;
  signal?: AbortSignal;
}) => {
  const { signal: _signal, ...body } = payload;
  return invokeCatalogSearch<SearchResponse<ProspectSearchRow>>({
    action: "search-prospects",
    ...body,
  });
};

export const searchCompanies = async (payload: {
  filters: CompanySearchFilters;
  cursor?: string | null;
  pageSize?: number;
  signal?: AbortSignal;
}) => {
  const { signal: _signal, ...body } = payload;
  return invokeCatalogSearch<SearchResponse<CompanySearchRow>>({
    action: "search-companies",
    ...body,
  });
};

export const getSearchFilterOptions = async (mode: SearchMode) =>
  invokeCatalogSearch<SearchFilterOptionsResponse>({
    action: "filter-options",
    mode,
  });

export const getProspectDetail = async (catalogRef: string) =>
  invokeCatalogSearch<SearchDetailResponse<ProspectSearchRow>>({
    action: "detail-prospect",
    catalogRef,
  });

export const getCompanyDetail = async (catalogRef: string) =>
  invokeCatalogSearch<SearchDetailResponse<CompanySearchRow>>({
    action: "detail-company",
    catalogRef,
  });

export const importSearchSelection = async (listId: string, items: ProspectSearchRow[]) =>
  invokeCatalogSearch<{ saved: number; linked: number; reused: number }>({
    action: "import-selection",
    listId,
    items,
  });
