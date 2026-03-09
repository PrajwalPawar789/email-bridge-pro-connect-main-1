import { supabase } from '@/integrations/supabase/client';
import type { EmailBuilderTemplate } from '@/lib/emailBuilderPersistence';
import type { LandingPageRecord } from '@/lib/landingPagesPersistence';

export type AiMode = 'email' | 'landing';
export type AiOptimizeFor = 'cost' | 'balanced' | 'quality';
export type AiProvider = 'openai' | 'claude';

export interface AiInputImage {
  name?: string;
  mimeType?: string;
  base64: string;
}

export interface AiGenerateRequest {
  mode: AiMode;
  instruction: string;
  outputMode?: 'blocks' | 'raw_html';
  brief?: Record<string, any>;
  current?: Record<string, any>;
  images?: AiInputImage[];
  threadId?: string;
  optimizeFor?: AiOptimizeFor;
  provider?: AiProvider;
  model?: string;
  topK?: number;
  postProcessMode?: 'off' | 'minimal' | 'strict';
}

export interface AiGenerateResponse {
  threadId: string;
  mode: AiMode;
  result: Record<string, any>;
  assistantMessage?: string;
  references: Array<Record<string, any>>;
  usage: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    diagnostics?: {
      requestedProvider?: string;
      selectedProvider?: string;
      fallbackReason?: string;
      postprocessMode?: string;
      providerAvailability?: {
        openai: boolean;
        claude: boolean;
      };
      imageCount?: number | null;
      qualityScore?: number | null;
      qualityTotalChecks?: number | null;
      qualityMetCount?: number | null;
      qualityUnmet?: string[];
    };
  };
}

const getRequestedImageCount = (payload: AiGenerateRequest) =>
  Array.isArray(payload.images) ? payload.images.filter((item) => String(item?.base64 || '').trim().length > 0).length : 0;

const assertImageCoverage = (payload: AiGenerateRequest, response: AiGenerateResponse) => {
  const requestedImageCount = getRequestedImageCount(payload);
  if (requestedImageCount <= 0) return;

  const diagnostics = response?.usage?.diagnostics || {};
  const selectedProvider = String(diagnostics?.selectedProvider || '').toLowerCase();
  const fallbackReason = String(diagnostics?.fallbackReason || '').toLowerCase();
  const rawFallbackReason = String(diagnostics?.fallbackReason || '').trim();
  const rawImageCount = Number(diagnostics?.imageCount);
  const hasImageCount = Number.isFinite(rawImageCount);
  const processedImageCount = hasImageCount ? rawImageCount : -1;
  const imageIgnoredByProvider =
    selectedProvider === 'heuristic' || fallbackReason.includes('image context is ignored');

  const providerCreditError =
    fallbackReason.includes('credit balance is too low') ||
    fallbackReason.includes('insufficient_quota') ||
    fallbackReason.includes('rate limit') ||
    fallbackReason.includes('billing') ||
    fallbackReason.includes('payment required');

  if (imageIgnoredByProvider) {
    if (providerCreditError) {
      throw new Error(
        `Image generation failed because the selected AI provider could not run vision (billing/quota issue). ${rawFallbackReason || ''}`.trim()
      );
    }
    if (rawFallbackReason) {
      throw new Error(
        `Image context was not processed by an AI vision model. Root cause: ${rawFallbackReason}`
      );
    }
    throw new Error(
      'Image context was not processed by an AI vision model. Configure OpenAI/Anthropic keys and retry.'
    );
  }

  if (!hasImageCount || processedImageCount < requestedImageCount) {
    const processedLabel = hasImageCount ? String(processedImageCount) : 'unknown';
    throw new Error(
      `Backend did not confirm image processing (requested ${requestedImageCount}, processed ${processedLabel}). Please redeploy ai-builder-generate and ai-builder-generate-stream.`
    );
  }
};

type AiGenerateStreamStatus = {
  stage?: string;
  message?: string;
};

type AiGenerateStreamHandlers = {
  onStatus?: (status: AiGenerateStreamStatus) => void;
  onDelta?: (delta: { text: string }) => void;
  onResult?: (result: AiGenerateResponse) => void;
};

type StreamSupportState = 'unknown' | 'available' | 'missing';
const STREAM_SUPPORT_STORAGE_KEY = 'ai_builder_stream_support_v1';
const streamFeatureSetting = String(
  import.meta.env.VITE_AI_BUILDER_STREAMING ?? import.meta.env.VITE_AI_STREAMING_ENABLED ?? 'auto'
)
  .trim()
  .toLowerCase();

const readPersistedStreamSupport = (): StreamSupportState => {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const value = window.localStorage.getItem(STREAM_SUPPORT_STORAGE_KEY);
    if (value === 'available' || value === 'missing') return value;
  } catch {
    // ignore localStorage access issues
  }
  return 'unknown';
};

const persistStreamSupport = (value: StreamSupportState) => {
  if (typeof window === 'undefined') return;
  try {
    if (value === 'unknown') {
      window.localStorage.removeItem(STREAM_SUPPORT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(STREAM_SUPPORT_STORAGE_KEY, value);
    }
  } catch {
    // ignore localStorage access issues
  }
};

const initialStreamSupportState: StreamSupportState =
  streamFeatureSetting === 'false' ||
  streamFeatureSetting === 'off' ||
  streamFeatureSetting === '0' ||
  streamFeatureSetting === 'disabled'
    ? 'missing'
    : readPersistedStreamSupport();

let streamSupportState: StreamSupportState = initialStreamSupportState;
let streamReprobeAttempted = false;
const STREAM_REQUEST_TIMEOUT_MS = 120000;

const resolveAuthContext = async () => {
  const authErrorMessage = 'Your session is invalid. Please sign in again.';

  const getValidUserFromToken = async (token: string) => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(authErrorMessage);
  }

  const currentToken = sessionData.session?.access_token;
  if (currentToken) {
    const currentUser = await getValidUserFromToken(currentToken);
    if (currentUser) {
      return { userId: currentUser.id, accessToken: currentToken };
    }
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  const refreshedToken = refreshData.session?.access_token;
  if (refreshError || !refreshedToken) {
    await supabase.auth.signOut();
    throw new Error(authErrorMessage);
  }

  const refreshedUser = await getValidUserFromToken(refreshedToken);
  if (!refreshedUser) {
    await supabase.auth.signOut();
    throw new Error(authErrorMessage);
  }

  return { userId: refreshedUser.id, accessToken: refreshedToken };
};

const isUnauthorizedFunctionError = (error: unknown) => {
  const candidate = error as any;
  const status = Number(candidate?.context?.status || candidate?.status || 0);
  const message = String(candidate?.message || '').toLowerCase();
  return status === 401 || message.includes('unauthorized') || message.includes('401');
};

const flattenText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(flattenText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(flattenText).filter(Boolean).join(' ');
  }
  return '';
};

export const buildEmailEmbeddingText = (
  template: Pick<EmailBuilderTemplate, 'name' | 'subject' | 'audience' | 'voice' | 'goal' | 'blocks' | 'rawHtml'>
) =>
  [
    template.name,
    template.subject,
    template.audience,
    template.voice,
    template.goal,
    template.rawHtml || '',
    ...(Array.isArray(template.blocks)
      ? template.blocks.map((block) => `${block.type} ${flattenText(block.content)}`)
      : []),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 120000);

export const buildLandingEmbeddingText = (page: Pick<LandingPageRecord, 'name' | 'slug' | 'blocks'>) =>
  [
    page.name,
    page.slug,
    ...(Array.isArray(page.blocks)
      ? page.blocks.map((block) => `${block.type} ${flattenText(block.content)}`)
      : []),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 120000);

export const generateAiBuilderDraft = async (payload: AiGenerateRequest): Promise<AiGenerateResponse> => {
  const { accessToken } = await resolveAuthContext();
  const invokeWithToken = (token: string) =>
    supabase.functions.invoke('ai-builder-generate', {
      body: payload,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

  let { data, error } = await invokeWithToken(accessToken);
  if (error && isUnauthorizedFunctionError(error)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.session?.access_token;
    if (!refreshError && refreshedToken) {
      const retried = await invokeWithToken(refreshedToken);
      data = retried.data;
      error = retried.error;
    }
  }
  if (error) throw error;
  const response = data as AiGenerateResponse;
  assertImageCoverage(payload, response);
  return response;
};

const parseSseBlock = (rawBlock: string) => {
  const lines = rawBlock.split('\n');
  let event = '';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  const rawData = dataLines.join('\n').trim();
  if (!rawData) return null;
  let data: any = null;
  try {
    data = JSON.parse(rawData);
  } catch {
    data = { message: rawData };
  }
  return { event, data };
};

export const generateAiBuilderDraftStream = async (
  payload: AiGenerateRequest,
  handlers: AiGenerateStreamHandlers = {}
): Promise<AiGenerateResponse> => {
  if (streamSupportState === 'missing') {
    const autoMode =
      streamFeatureSetting === 'auto' ||
      streamFeatureSetting === '' ||
      streamFeatureSetting === 'enabled' ||
      streamFeatureSetting === 'true' ||
      streamFeatureSetting === '1';
    if (autoMode && !streamReprobeAttempted) {
      streamReprobeAttempted = true;
      streamSupportState = 'unknown';
      persistStreamSupport('unknown');
    } else {
      throw new Error('Streaming endpoint is not available');
    }
  }

  const { accessToken } = await resolveAuthContext();
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!baseUrl) {
    throw new Error('VITE_SUPABASE_URL is missing');
  }

  const requestStream = async (token: string) => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), STREAM_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${baseUrl}/functions/v1/ai-builder-generate-stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(anonKey ? { apikey: anonKey } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      const isTimeoutAbort =
        error instanceof DOMException && error.name === 'AbortError';
      if (isTimeoutAbort) {
        throw new Error(
          `AI stream timed out after ${Math.round(STREAM_REQUEST_TIMEOUT_MS / 1000)}s. Try balanced mode or retry.`
        );
      }
      if (
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('load failed')
      ) {
        streamSupportState = 'missing';
        persistStreamSupport('missing');
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  let response: Response = await requestStream(accessToken);
  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.session?.access_token;
    if (!refreshError && refreshedToken) {
      response = await requestStream(refreshedToken);
    }
  }

  if (!response.ok) {
    if (response.status === 404 || response.status === 405) {
      streamSupportState = 'missing';
      persistStreamSupport('missing');
    }
    let errorMessage = `Streaming request failed (${response.status})`;
    try {
      const errorPayload = await response.json();
      errorMessage = String(errorPayload?.error || errorMessage);
    } catch {
      // keep default message
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('No stream body returned');
  }
  streamSupportState = 'available';
  persistStreamSupport('available');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: AiGenerateResponse | null = null;

  const processSseBlocks = (rawBlocks: string[]) => {
    for (const block of rawBlocks) {
      const parsed = parseSseBlock(block);
      if (!parsed) continue;

      if (parsed.event === 'status') {
        handlers.onStatus?.(parsed.data || {});
        continue;
      }
      if (parsed.event === 'delta') {
        const text = String(parsed.data?.text || '');
        if (text) handlers.onDelta?.({ text });
        continue;
      }
      if (parsed.event === 'result') {
        finalResult = parsed.data as AiGenerateResponse;
        handlers.onResult?.(finalResult);
        continue;
      }
      if (parsed.event === 'error') {
        throw new Error(String(parsed.data?.message || 'Streaming generation failed'));
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    processSseBlocks(blocks);
  }

  if (buffer.trim().length > 0) {
    processSseBlocks([buffer]);
  }

  if (!finalResult) {
    throw new Error('Streaming ended without a final result');
  }
  assertImageCoverage(payload, finalResult);
  return finalResult;
};

export const indexAiBuilderObject = async (payload: {
  mode: AiMode;
  objectId: string;
  text: string;
  threadId?: string;
  metadata?: Record<string, any>;
}) => {
  if (!payload.objectId || !payload.text.trim()) return null;
  const invokeIndex = async (accessToken: string) =>
    supabase.functions.invoke('ai-builder-index', {
      body: payload,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

  const { accessToken } = await resolveAuthContext();
  let { data, error } = await invokeIndex(accessToken);

  if (error && isUnauthorizedFunctionError(error)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.session?.access_token;
    if (!refreshError && refreshedToken) {
      const retried = await invokeIndex(refreshedToken);
      data = retried.data;
      error = retried.error;
    }
  }

  if (error) throw error;
  return data;
};
