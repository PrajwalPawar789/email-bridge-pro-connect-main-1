import { supabase } from '@/integrations/supabase/client';
import { PIPELINE_TEMPLATES, getLargestCurrencyValue } from '@/lib/pipeline';

const DEFAULT_TEMPLATE = PIPELINE_TEMPLATES[0];

export type DbPipeline = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  template_id: string | null;
  is_default: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DbPipelineStage = {
  id: string;
  pipeline_id: string;
  template_stage_id: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  tone: string | null;
  is_won: boolean;
  is_lost: boolean;
};

export type DbPipelineStageKeyword = {
  id: string;
  pipeline_stage_id: string;
  keyword: string;
  created_at?: string | null;
};

export type DbOpportunity = {
  id: string;
  user_id: string;
  pipeline_id: string;
  stage_id: string | null;
  campaign_id: string | null;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  company: string | null;
  value: number | null;
  owner: string | null;
  next_step: string | null;
  last_activity_at: string;
  created_at?: string | null;
  updated_at?: string | null;
  campaigns?: { name: string } | null;
};

export type PipelineStageSeed = {
  templateStageId?: string | null;
  name: string;
  description?: string | null;
  tone?: string | null;
  is_won?: boolean;
  is_lost?: boolean;
  keywords?: string[];
};

export type PipelineStageUpdateSeed = PipelineStageSeed & {
  id?: string;
};

const slugifyStageId = (value: string) => (
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const sanitizeStageKeywords = (keywords?: string[]) => {
  const unique = new Set<string>();
  (keywords || []).forEach((keyword) => {
    const cleaned = (keyword || '').trim().toLowerCase();
    if (!cleaned || cleaned.length < 2) return;
    unique.add(cleaned);
  });
  return Array.from(unique);
};

const normalizeStageSeeds = (stages: PipelineStageSeed[]) => {
  const usedTemplateIds = new Set<string>();
  return stages.map((stage, index) => {
    const trimmedName = stage.name.trim() || `Stage ${index + 1}`;
    const baseTemplateId =
      slugifyStageId(stage.templateStageId || '') ||
      slugifyStageId(trimmedName) ||
      `stage-${index + 1}`;

    let templateStageId = baseTemplateId;
    let suffix = 2;
    while (usedTemplateIds.has(templateStageId)) {
      templateStageId = `${baseTemplateId}-${suffix}`;
      suffix += 1;
    }
    usedTemplateIds.add(templateStageId);

    return {
      templateStageId,
      name: trimmedName,
      description: stage.description?.trim() || null,
      tone: stage.tone || 'slate',
      is_won: !!stage.is_won,
      is_lost: !!stage.is_lost,
      keywords: sanitizeStageKeywords(stage.keywords),
    };
  });
};

const replacePipelineStageKeywords = async (rows: Array<{ stageId: string; keywords: string[] }>) => {
  const stageIds = rows.map((row) => row.stageId).filter(Boolean);
  if (stageIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from('pipeline_stage_keywords')
    .delete()
    .in('pipeline_stage_id', stageIds);
  if (deleteError) throw deleteError;

  const keywordRows = rows.flatMap((row) =>
    row.keywords.map((keyword) => ({
      pipeline_stage_id: row.stageId,
      keyword,
    }))
  );

  if (keywordRows.length > 0) {
    const { error: insertError } = await supabase
      .from('pipeline_stage_keywords')
      .insert(keywordRows);
    if (insertError) throw insertError;
  }
};

export const ensurePipelineForTemplate = async (userId: string, templateId: string) => {
  const { data: existing, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;

  let pipeline = existing?.[0] as DbPipeline | undefined;
  if (!pipeline) {
    const template = PIPELINE_TEMPLATES.find((t) => t.id === templateId) || DEFAULT_TEMPLATE;
    const { data: created, error: createError } = await supabase
      .from('pipelines')
      .insert({
        user_id: userId,
        name: template.name,
        description: template.description,
        template_id: template.id,
        is_default: template.id === DEFAULT_TEMPLATE.id,
      })
      .select('*')
      .single();

    if (createError) throw createError;
    pipeline = created as DbPipeline;
  }

  const stages = await ensurePipelineStages(pipeline.id, templateId);
  return { pipeline, stages };
};

export const ensureDefaultPipeline = async (userId: string) => {
  return ensurePipelineForTemplate(userId, DEFAULT_TEMPLATE.id);
};

export const createPipelineWithStages = async (payload: {
  userId: string;
  name: string;
  description?: string | null;
  templateId?: string | null;
  stages?: PipelineStageSeed[];
}) => {
  const { data: created, error } = await supabase
    .from('pipelines')
    .insert({
      user_id: payload.userId,
      name: payload.name,
      description: payload.description || null,
      template_id: payload.templateId || null,
      is_default: false,
    })
    .select('*')
    .single();

  if (error) throw error;

  const pipeline = created as DbPipeline;

  if (payload.stages && payload.stages.length > 0) {
    const normalizedStages = normalizeStageSeeds(payload.stages);
    const stageRows = normalizedStages.map((stage, index) => ({
      pipeline_id: pipeline.id,
      template_stage_id: stage.templateStageId ?? null,
      name: stage.name,
      description: stage.description || null,
      sort_order: index,
      tone: stage.tone || null,
      is_won: !!stage.is_won,
      is_lost: !!stage.is_lost,
    }));

    const { error: stageError } = await supabase.from('pipeline_stages').insert(stageRows);
    if (stageError) throw stageError;

    const stages = await fetchPipelineStages(pipeline.id);
    const keywordsByStage = stages.map((stage) => ({
      stageId: stage.id,
      keywords: normalizedStages[stage.sort_order]?.keywords || [],
    }));
    await replacePipelineStageKeywords(keywordsByStage);
    return { pipeline, stages };
  } else {
    const templateId = payload.templateId || DEFAULT_TEMPLATE.id;
    await ensurePipelineStages(pipeline.id, templateId);
  }

  const stages = await fetchPipelineStages(pipeline.id);
  return { pipeline, stages };
};

export const updatePipelineWithStages = async (payload: {
  pipelineId: string;
  name: string;
  description?: string | null;
  stages: PipelineStageUpdateSeed[];
}) => {
  const normalizedName = payload.name.trim() || 'Pipeline';
  const normalizedStagesInput = payload.stages.filter((stage) => stage.name.trim().length > 0);
  if (normalizedStagesInput.length === 0) {
    throw new Error('At least one stage is required.');
  }

  const normalizedStages = normalizeStageSeeds(normalizedStagesInput);
  const now = new Date().toISOString();

  const { error: pipelineError } = await supabase
    .from('pipelines')
    .update({
      name: normalizedName,
      description: payload.description?.trim() || null,
      updated_at: now,
    })
    .eq('id', payload.pipelineId);

  if (pipelineError) throw pipelineError;

  const existingStages = await fetchPipelineStages(payload.pipelineId);
  const existingById = new Map(existingStages.map((stage) => [stage.id, stage]));
  const resolvedStages: Array<{ id: string; is_won: boolean; is_lost: boolean; keywords: string[] }> = [];

  for (let index = 0; index < normalizedStages.length; index += 1) {
    const sourceStage = normalizedStagesInput[index];
    const normalizedStage = normalizedStages[index];
    const candidateId = sourceStage.id;
    const stagePayload = {
      template_stage_id: normalizedStage.templateStageId,
      name: normalizedStage.name,
      description: normalizedStage.description,
      sort_order: index,
      tone: normalizedStage.tone,
      is_won: normalizedStage.is_won,
      is_lost: normalizedStage.is_lost,
      updated_at: now,
    };

    if (candidateId && existingById.has(candidateId)) {
      const { error: updateError } = await supabase
        .from('pipeline_stages')
        .update(stagePayload)
        .eq('id', candidateId)
        .eq('pipeline_id', payload.pipelineId);
      if (updateError) throw updateError;
      resolvedStages.push({
        id: candidateId,
        is_won: normalizedStage.is_won,
        is_lost: normalizedStage.is_lost,
        keywords: normalizedStage.keywords || [],
      });
      continue;
    }

    const { data: insertedStage, error: insertError } = await supabase
      .from('pipeline_stages')
      .insert({
        pipeline_id: payload.pipelineId,
        ...stagePayload,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    resolvedStages.push({
      id: insertedStage.id,
      is_won: normalizedStage.is_won,
      is_lost: normalizedStage.is_lost,
      keywords: normalizedStage.keywords || [],
    });
  }

  const retainedStageIds = new Set(resolvedStages.map((stage) => stage.id));
  const removedStageIds = existingStages
    .filter((stage) => !retainedStageIds.has(stage.id))
    .map((stage) => stage.id);

  if (removedStageIds.length > 0) {
    const fallback = resolvedStages[0];
    if (fallback) {
      const fallbackStatus = fallback.is_won ? 'won' : fallback.is_lost ? 'lost' : 'open';
      const { error: moveError } = await supabase
        .from('opportunities')
        .update({
          stage_id: fallback.id,
          status: fallbackStatus,
          updated_at: now,
        })
        .eq('pipeline_id', payload.pipelineId)
        .in('stage_id', removedStageIds);
      if (moveError) throw moveError;
    } else {
      const { error: clearError } = await supabase
        .from('opportunities')
        .update({
          stage_id: null,
          status: 'open',
          updated_at: now,
        })
        .eq('pipeline_id', payload.pipelineId)
        .in('stage_id', removedStageIds);
      if (clearError) throw clearError;
    }

    const { error: deleteError } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('pipeline_id', payload.pipelineId)
      .in('id', removedStageIds);
    if (deleteError) throw deleteError;
  }

  for (const stage of resolvedStages) {
    const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open';
    const { error: statusError } = await supabase
      .from('opportunities')
      .update({ status, updated_at: now })
      .eq('pipeline_id', payload.pipelineId)
      .eq('stage_id', stage.id);
    if (statusError) throw statusError;
  }

  await replacePipelineStageKeywords(
    resolvedStages.map((stage) => ({
      stageId: stage.id,
      keywords: stage.keywords,
    }))
  );

  const stages = await fetchPipelineStages(payload.pipelineId);
  return { stages };
};

export const ensurePipelineStages = async (pipelineId: string, templateId: string) => {
  const { data: existingStages, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  if (existingStages && existingStages.length > 0) {
    return existingStages as DbPipelineStage[];
  }

  const template = PIPELINE_TEMPLATES.find((t) => t.id === templateId) || DEFAULT_TEMPLATE;
  const stageRows = template.stages.map((stage, index) => ({
    pipeline_id: pipelineId,
    template_stage_id: stage.id,
    name: stage.name,
    description: stage.description,
    sort_order: index,
    tone: stage.tone,
    is_won: stage.id === 'closed-won',
    is_lost: stage.id === 'closed-lost',
  }));

  const { error: insertError } = await supabase.from('pipeline_stages').insert(stageRows);
  if (insertError) throw insertError;

  const { data: inserted, error: fetchError } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('sort_order', { ascending: true });

  if (fetchError) throw fetchError;
  return inserted as DbPipelineStage[];
};

export const fetchPipelines = async (userId: string) => {
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as DbPipeline[];
};

export const fetchPipelineStages = async (pipelineId: string) => {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data as DbPipelineStage[];
};

export const fetchPipelineStageKeywords = async (pipelineId: string) => {
  const stages = await fetchPipelineStages(pipelineId);
  const stageIds = stages.map((stage) => stage.id);
  if (stageIds.length === 0) return {} as Record<string, string[]>;

  const { data, error } = await supabase
    .from('pipeline_stage_keywords')
    .select('pipeline_stage_id, keyword')
    .in('pipeline_stage_id', stageIds)
    .order('keyword', { ascending: true });

  if (error) throw error;

  const map: Record<string, string[]> = {};
  (data || []).forEach((row) => {
    const stageId = row.pipeline_stage_id;
    if (!stageId) return;
    if (!map[stageId]) map[stageId] = [];
    map[stageId].push(row.keyword);
  });
  return map;
};

export const fetchOpportunities = async (params: {
  userId: string;
  pipelineId?: string | null;
  campaignId?: string | null;
}) => {
  let query = supabase
    .from('opportunities')
    .select('*, campaigns(name)')
    .eq('user_id', params.userId);

  if (params.pipelineId) {
    query = query.eq('pipeline_id', params.pipelineId);
  }
  if (params.campaignId) {
    query = query.eq('campaign_id', params.campaignId);
  }

  const { data, error } = await query.order('last_activity_at', { ascending: false });
  if (error) throw error;
  return data as DbOpportunity[];
};

export const createOpportunity = async (payload: {
  userId: string;
  pipelineId: string;
  stageId: string | null;
  status: string;
  contactName?: string | null;
  contactEmail?: string | null;
  company?: string | null;
  value?: number | null;
  owner?: string | null;
  nextStep?: string | null;
  campaignId?: string | null;
}) => {
  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      user_id: payload.userId,
      pipeline_id: payload.pipelineId,
      stage_id: payload.stageId,
      status: payload.status,
      contact_name: payload.contactName,
      contact_email: payload.contactEmail,
      company: payload.company,
      value: payload.value,
      owner: payload.owner,
      next_step: payload.nextStep,
      campaign_id: payload.campaignId,
      last_activity_at: new Date().toISOString(),
    })
    .select('*, campaigns(name)')
    .single();

  if (error) throw error;
  return data as DbOpportunity;
};

export const updateOpportunity = async (opportunityId: string, payload: Partial<{
  stageId: string | null;
  status: string;
  owner: string | null;
  value: number | null;
  campaignId: string | null;
  nextStep: string | null;
  lastActivityAt: string;
}>) => {
  const { data, error } = await supabase
    .from('opportunities')
    .update({
      stage_id: payload.stageId,
      status: payload.status,
      owner: payload.owner,
      value: payload.value,
      campaign_id: payload.campaignId,
      next_step: payload.nextStep,
      last_activity_at: payload.lastActivityAt ?? new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .select('*, campaigns(name)')
    .single();

  if (error) throw error;
  return data as DbOpportunity;
};

export const deleteOpportunity = async (opportunityId: string) => {
  const { error } = await supabase.from('opportunities').delete().eq('id', opportunityId);
  if (error) throw error;
};

export const findOpportunityByEmail = async (pipelineId: string, email: string) => {
  const { data, error } = await supabase
    .from('opportunities')
    .select('*, campaigns(name)')
    .eq('pipeline_id', pipelineId)
    .eq('contact_email', email)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? (data[0] as DbOpportunity) : null;
};

export const suggestOpportunityValueFromCampaign = async (campaignId: string) => {
  if (!campaignId) return null;
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('subject, body, template_id')
    .eq('id', campaignId)
    .single();

  if (error || !campaign) return null;

  const { data: followups } = await supabase
    .from('campaign_followups')
    .select('subject, body, template_id')
    .eq('campaign_id', campaignId);

  const templateIds = new Set<string>();
  if (campaign.template_id) templateIds.add(campaign.template_id);
  (followups || []).forEach((item) => {
    if (item.template_id) templateIds.add(item.template_id);
  });

  let templates: { subject: string | null; body: string | null }[] = [];
  if (templateIds.size > 0) {
    const { data: templateData } = await supabase
      .from('email_templates')
      .select('subject, body')
      .in('id', Array.from(templateIds));
    templates = templateData || [];
  }

  const texts = [
    campaign.subject,
    campaign.body,
    ...(followups || []).flatMap((item) => [item.subject, item.body]),
    ...templates.flatMap((item) => [item.subject, item.body]),
  ].filter(Boolean) as string[];

  let largest: number | null = null;
  texts.forEach((text) => {
    const value = getLargestCurrencyValue(text);
    if (value != null) {
      largest = largest == null ? value : Math.max(largest, value);
    }
  });

  return largest;
};
