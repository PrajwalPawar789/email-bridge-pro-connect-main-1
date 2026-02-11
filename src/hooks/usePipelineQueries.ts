import { useQuery } from "@tanstack/react-query";
import {
  ensureDefaultPipeline,
  fetchOpportunities,
  fetchPipelineStages,
  fetchPipelines,
} from "@/lib/pipelineStore";

export const usePipelineBootstrap = (userId?: string) =>
  useQuery({
    queryKey: ["pipeline-bootstrap", userId],
    queryFn: () => ensureDefaultPipeline(userId!),
    enabled: !!userId,
    staleTime: 1000 * 30,
  });

export const usePipelineList = (userId?: string) =>
  useQuery({
    queryKey: ["pipelines", userId],
    queryFn: () => fetchPipelines(userId!),
    enabled: !!userId,
    staleTime: 1000 * 30,
  });

export const usePipelineStages = (pipelineId?: string) =>
  useQuery({
    queryKey: ["pipeline-stages", pipelineId],
    queryFn: () => fetchPipelineStages(pipelineId!),
    enabled: !!pipelineId,
    staleTime: 1000 * 30,
  });

export const usePipelineOpportunities = (
  userId?: string,
  pipelineId?: string | null,
  campaignId?: string | null
) =>
  useQuery({
    queryKey: ["pipeline-opps", userId, pipelineId, campaignId],
    queryFn: () => fetchOpportunities({ userId: userId!, pipelineId, campaignId }),
    enabled: !!userId && !!pipelineId,
    keepPreviousData: true,
    staleTime: 1000 * 15,
  });
