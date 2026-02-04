/**
 * HTTP Agent Adapter
 *
 * Communicates with an AI agent via HTTP API.
 */

import type { ToolCall } from '../../assertions/types.js';
import type { ResolvedAgentConfig } from '../../config/types.js';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RETRYABLE_STATUS_CODES,
  DEBUG_TEXT_TRUNCATE_LENGTH,
} from '../../constants.js';
import type {
  AgentAdapter,
  AgentResponse,
  AgentUsageSummary,
  ChatOptions,
  DetailedUsage,
  TokenUsage,
  UsageEvent,
} from '../types.js';

/**
 * Options for creating an HTTP agent adapter.
 */
export interface HttpAgentOptions {
  /** Base URL of the API */
  baseUrl: string;
  /** Authentication token */
  token: string;
  /** Chat endpoint path (default: '/v1/chat') */
  chatEndpoint?: string;
  /** Additional default headers */
  headers?: Record<string, string>;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Verbose logging */
  verbose?: boolean;
  /** Number of retry attempts (default: 0) */
  retries?: number;
  /** Base delay in ms between retries, doubled for each attempt (default: 1000) */
  retryDelay?: number;
  /** HTTP status codes to retry on (default: [502, 503, 504]) */
  retryOn?: number[];
}

import { sleep } from '../../helpers/utils.js';

/**
 * Create an HTTP agent adapter.
 */
export function createHttpAgent(options: HttpAgentOptions): AgentAdapter {
  const {
    baseUrl,
    token,
    chatEndpoint = '/v1/chat',
    headers: defaultHeaders = {},
    timeout: defaultTimeout = DEFAULT_HTTP_TIMEOUT_MS,
    verbose = false,
    retries = DEFAULT_RETRY_COUNT,
    retryDelay = DEFAULT_RETRY_DELAY_MS,
    retryOn = DEFAULT_RETRYABLE_STATUS_CODES as unknown as number[],
  } = options;

  return {
    async chat(chatOptions: ChatOptions): Promise<AgentResponse> {
      const url = `${baseUrl}${chatEndpoint}`;

      const requestBody = {
        message: chatOptions.message,
        userId: chatOptions.userId,
        conversationId: chatOptions.conversationId,
        maxToolCalls: chatOptions.maxToolCalls,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...defaultHeaders,
        ...chatOptions.headers,
      };

      const timeout = chatOptions.timeout ?? defaultTimeout;

      if (verbose) {
        console.log(`[HTTP Agent] POST ${url}`);
        console.log(`[HTTP Agent] Body: ${JSON.stringify(requestBody, null, 2)}`);
      }

      // Track request duration
      const startTime = Date.now();

      // Retry loop
      let lastError: Error | undefined;
      for (let attempt = 0; attempt <= retries; attempt++) {
        // Create abort controller for this attempt
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          if (attempt > 0 && verbose) {
            console.log(`[HTTP Agent] Retry attempt ${attempt}/${retries}`);
          }

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Check if we should retry based on status code
          if (!response.ok && retryOn.includes(response.status) && attempt < retries) {
            const errorText = await response.text();
            lastError = new Error(`HTTP ${response.status}: ${errorText}`);
            if (verbose) {
              console.log(`[HTTP Agent] Retryable error: ${lastError.message}`);
            }
            // Wait before retry with exponential backoff
            await sleep(retryDelay * Math.pow(2, attempt));
            continue;
          }

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const durationMs = Date.now() - startTime;
          const data = await response.json();

          if (verbose) {
            console.log(`[HTTP Agent] Response: ${JSON.stringify(data, null, 2)}`);
          }

          // Always log raw response structure for debugging
          const normalized = normalizeResponse(data);
          normalized.durationMs = durationMs;

          if (verbose) {
            console.log(`[HTTP Agent] Normalized: text="${normalized.text.slice(0, DEBUG_TEXT_TRUNCATE_LENGTH)}", toolCalls=${normalized.toolCalls.length}`);
          }

          return normalized;
        } catch (error) {
          clearTimeout(timeoutId);

          if (error instanceof Error && error.name === 'AbortError') {
            lastError = new Error(`Request timeout after ${timeout}ms`);
          } else {
            lastError = error instanceof Error ? error : new Error(String(error));
          }

          // Don't retry if this is an HTTP error we threw (not a network error)
          // HTTP errors start with 'HTTP ' and should not be retried unless explicitly configured
          const isHttpError = error instanceof Error && error.message.startsWith('HTTP ');
          if (isHttpError) {
            throw lastError;
          }

          // If this was a network error and we have retries left, retry
          if (attempt < retries && error instanceof Error && error.name !== 'AbortError') {
            if (verbose) {
              console.log(`[HTTP Agent] Network error, will retry: ${error.message}`);
            }
            await sleep(retryDelay * Math.pow(2, attempt));
            continue;
          }

          // No more retries or abort error
          throw lastError;
        }
      }

      // Should not reach here, but TypeScript needs this
      throw lastError ?? new Error('Unknown error after retries');
    },
  };
}

/**
 * Create an HTTP agent adapter from resolved config.
 */
export function createHttpAgentFromConfig(config: ResolvedAgentConfig, verbose?: boolean): AgentAdapter {
  return createHttpAgent({
    baseUrl: config.baseUrl,
    token: config.token,
    chatEndpoint: config.chatEndpoint,
    headers: config.headers,
    timeout: config.timeout,
    retries: config.retries,
    retryDelay: config.retryDelay,
    retryOn: config.retryOn,
    verbose,
  });
}

/**
 * Normalize the API response to a standard format.
 *
 * Handles different response formats from various API implementations.
 */
function normalizeResponse(data: unknown): AgentResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response: expected object');
  }

  const response = data as Record<string, unknown>;

  // Extract text content
  let text = '';
  if (typeof response.text === 'string') {
    text = response.text;
  } else if (typeof response.message === 'string') {
    text = response.message;
  } else if (typeof response.assistantMessage === 'string') {
    text = response.assistantMessage;
  } else if (typeof response.content === 'string') {
    text = response.content;
  } else if (response.response && typeof response.response === 'string') {
    text = response.response;
  }

  // Handle nested data.assistantMessage (from sendSuccess wrapper)
  if (!text && response.data && typeof response.data === 'object') {
    const data = response.data as Record<string, unknown>;
    if (typeof data.assistantMessage === 'string') {
      text = data.assistantMessage;
    } else if (data.assistantMessage && typeof data.assistantMessage === 'object') {
      // Handle PocketCoach format: { role, parts: [{ type, text }] }
      const msg = data.assistantMessage as Record<string, unknown>;
      if (Array.isArray(msg.parts)) {
        // Collect ALL text parts (last one is typically the final response)
        const textParts: string[] = [];
        for (const part of msg.parts) {
          if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
            textParts.push((part as { text: string }).text);
          }
        }
        // Use the LAST text part as it's typically the final response
        if (textParts.length > 0) {
          text = textParts[textParts.length - 1];
        }
      }
    }

    // Prefer assistant-output from usage.events (most reliable source of final text)
    if (data.usage && typeof data.usage === 'object') {
      const usage = data.usage as Record<string, unknown>;
      if (Array.isArray(usage.events)) {
        // Find the last assistant-output event (final response text)
        for (let i = usage.events.length - 1; i >= 0; i--) {
          const event = usage.events[i];
          if (event && typeof event === 'object') {
            const e = event as Record<string, unknown>;
            if (e.type === 'assistant-output' && typeof e.text === 'string') {
              text = e.text;
              break;
            }
          }
        }
      }
    }
  }

  // Handle nested data wrapper (from sendSuccess)
  const dataObj = (response.data && typeof response.data === 'object')
    ? response.data as Record<string, unknown>
    : response;

  // Extract tool calls (from top level or nested data)
  let toolCalls = normalizeToolCalls(response);
  if (toolCalls.length === 0 && dataObj !== response) {
    toolCalls = normalizeToolCalls(dataObj);
  }

  // Handle PocketCoach format: tool calls in usage.events
  // Only include tool calls from the current turn (origin: 'current' or undefined for backward compatibility)
  if (toolCalls.length === 0 && dataObj.usage && typeof dataObj.usage === 'object') {
    const usage = dataObj.usage as Record<string, unknown>;
    if (Array.isArray(usage.events)) {
      for (const event of usage.events) {
        if (event && typeof event === 'object') {
          const e = event as Record<string, unknown>;
          const isCurrentTurn = e.origin === 'current' || e.origin === undefined;
          if (e.type === 'tool-call' && typeof e.toolName === 'string' && isCurrentTurn) {
            toolCalls.push({
              name: e.toolName,
              args: (e.input && typeof e.input === 'object') ? e.input as Record<string, unknown> : {},
              result: e.result,
            });
          }
        }
      }
    }
  }

  // Extract conversation ID
  let conversationId = '';
  if (typeof response.conversationId === 'string') {
    conversationId = response.conversationId;
  } else if (typeof response.threadId === 'string') {
    conversationId = response.threadId;
  } else if (typeof dataObj.conversationId === 'string') {
    conversationId = dataObj.conversationId;
  }

  // Extract correlation ID (for tracing)
  let correlationId: string | undefined;
  if (typeof response.correlationId === 'string') {
    correlationId = response.correlationId;
  } else if (typeof dataObj.correlationId === 'string') {
    correlationId = dataObj.correlationId;
  }

  // Extract usage (from top level or nested data)
  let usage = normalizeUsage(response);
  if (!usage && dataObj !== response) {
    usage = normalizeUsage(dataObj);
  }

  // Extract detailed usage (per-agent breakdown, events, totals)
  const detailedUsage = normalizeDetailedUsage(response);

  // Extract message processing metadata (condenser, pruner, etc.)
  const messageProcessing = normalizeMessageProcessing(response);

  return {
    text,
    toolCalls,
    conversationId,
    correlationId,
    usage,
    detailedUsage,
    messageProcessing,
    raw: data,
  };
}

/**
 * Normalize tool calls from various formats.
 */
function normalizeToolCalls(response: Record<string, unknown>): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // Check for toolCalls array
  if (Array.isArray(response.toolCalls)) {
    for (const call of response.toolCalls) {
      if (call && typeof call === 'object') {
        const normalized = normalizeToolCall(call as Record<string, unknown>);
        if (normalized) {
          toolCalls.push(normalized);
        }
      }
    }
  }

  // Check for tools array
  if (Array.isArray(response.tools)) {
    for (const call of response.tools) {
      if (call && typeof call === 'object') {
        const normalized = normalizeToolCall(call as Record<string, unknown>);
        if (normalized) {
          toolCalls.push(normalized);
        }
      }
    }
  }

  // Check for tool_calls array (OpenAI format)
  if (Array.isArray(response.tool_calls)) {
    for (const call of response.tool_calls) {
      if (call && typeof call === 'object') {
        const normalized = normalizeToolCall(call as Record<string, unknown>);
        if (normalized) {
          toolCalls.push(normalized);
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Normalize a single tool call.
 */
function normalizeToolCall(call: Record<string, unknown>): ToolCall | null {
  // Get name
  let name = '';
  if (typeof call.name === 'string') {
    name = call.name;
  } else if (typeof call.toolName === 'string') {
    name = call.toolName;
  } else if (typeof call.tool === 'string') {
    name = call.tool;
  } else if (call.function && typeof (call.function as Record<string, unknown>).name === 'string') {
    name = (call.function as Record<string, unknown>).name as string;
  }

  if (!name) {
    return null;
  }

  // Get args
  let args: Record<string, unknown> = {};
  if (call.args && typeof call.args === 'object') {
    args = call.args as Record<string, unknown>;
  } else if (call.arguments && typeof call.arguments === 'object') {
    args = call.arguments as Record<string, unknown>;
  } else if (call.input && typeof call.input === 'object') {
    args = call.input as Record<string, unknown>;
  } else if (call.function && typeof (call.function as Record<string, unknown>).arguments === 'string') {
    try {
      args = JSON.parse((call.function as Record<string, unknown>).arguments as string);
    } catch {
      args = {};
    }
  }

  // Get result
  let result: unknown;
  if ('result' in call) {
    result = call.result;
  } else if ('output' in call) {
    result = call.output;
  }

  return { name, args, result };
}

/**
 * Normalize usage statistics.
 */
function normalizeUsage(response: Record<string, unknown>): TokenUsage | undefined {
  let usage = response.usage;

  // Handle nested usage object
  if (!usage && response.meta && typeof response.meta === 'object') {
    usage = (response.meta as Record<string, unknown>).usage;
  }

  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const usageObj = usage as Record<string, unknown>;

  // Check for nested totals object (PocketCoach format)
  let totalsObj = usageObj;
  if (usageObj.totals && typeof usageObj.totals === 'object') {
    totalsObj = usageObj.totals as Record<string, unknown>;
  }

  // Try different field names
  const inputTokens =
    typeof totalsObj.inputTokens === 'number'
      ? totalsObj.inputTokens
      : typeof totalsObj.prompt_tokens === 'number'
        ? totalsObj.prompt_tokens
        : 0;

  const outputTokens =
    typeof totalsObj.outputTokens === 'number'
      ? totalsObj.outputTokens
      : typeof totalsObj.completion_tokens === 'number'
        ? totalsObj.completion_tokens
        : 0;

  const totalTokens =
    typeof totalsObj.totalTokens === 'number'
      ? totalsObj.totalTokens
      : typeof totalsObj.total_tokens === 'number'
        ? totalsObj.total_tokens
        : inputTokens + outputTokens;

  if (inputTokens === 0 && outputTokens === 0) {
    return undefined;
  }

  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Normalize detailed usage data from response.
 * Extracts per-agent breakdown, events, and totals.
 */
function normalizeDetailedUsage(response: Record<string, unknown>): DetailedUsage | undefined {
  let usage = response.usage;

  // Handle nested data wrapper (from sendSuccess)
  if (!usage && response.data && typeof response.data === 'object') {
    const dataObj = response.data as Record<string, unknown>;
    usage = dataObj.usage;
  }

  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const usageObj = usage as Record<string, unknown>;

  // Extract agent summaries
  let agentSummaries: AgentUsageSummary[] | undefined;
  if (Array.isArray(usageObj.agentSummaries)) {
    agentSummaries = usageObj.agentSummaries.map((summary: unknown) => {
      const s = summary as Record<string, unknown>;
      return {
        agentId: String(s.agentId ?? ''),
        inputTokens: Number(s.inputTokens ?? 0),
        outputTokens: Number(s.outputTokens ?? 0),
        totalTokens: Number(s.totalTokens ?? 0),
        callCount: Number(s.callCount ?? 0),
        provider: typeof s.provider === 'string' ? s.provider : undefined,
        model: typeof s.model === 'string' ? s.model : undefined,
        trackedBreakdown: s.trackedBreakdown as AgentUsageSummary['trackedBreakdown'],
      };
    });
  }

  // Extract events
  let events: UsageEvent[] | undefined;
  if (Array.isArray(usageObj.events)) {
    events = usageObj.events.map((event: unknown) => {
      const e = event as Record<string, unknown>;
      return {
        type: e.type as UsageEvent['type'],
        text: typeof e.text === 'string' ? e.text : undefined,
        toolName: typeof e.toolName === 'string' ? e.toolName : undefined,
        input: e.input,
        output: e.output,
        agent: typeof e.agent === 'string' ? e.agent : undefined,
        stepNumber: typeof e.stepNumber === 'number' ? e.stepNumber : undefined,
        origin: e.origin as UsageEvent['origin'],
        timestamp: typeof e.timestamp === 'string' ? e.timestamp : undefined,
        query: typeof e.query === 'string' ? e.query : undefined,
      };
    });
  }

  // Extract totals
  let totals: DetailedUsage['totals'];
  if (usageObj.totals && typeof usageObj.totals === 'object') {
    const t = usageObj.totals as Record<string, unknown>;
    totals = {
      inputTokens: Number(t.inputTokens ?? 0),
      outputTokens: Number(t.outputTokens ?? 0),
      totalTokens: Number(t.totalTokens ?? 0),
      callCount: Number(t.callCount ?? 0),
      cachedInputTokens: typeof t.cachedInputTokens === 'number' ? t.cachedInputTokens : undefined,
      cacheCreationTokens: typeof t.cacheCreationTokens === 'number' ? t.cacheCreationTokens : undefined,
      cacheReadTokens: typeof t.cacheReadTokens === 'number' ? t.cacheReadTokens : undefined,
      reasoningTokens: typeof t.reasoningTokens === 'number' ? t.reasoningTokens : undefined,
    };
  }

  // Only return if we have some data
  if (!agentSummaries && !events && !totals) {
    return undefined;
  }

  return {
    agentSummaries,
    events,
    totals,
  };
}

/**
 * Normalize message processing metadata from response.
 * Extracts condenser, pruner, tokenLimiter states.
 */
function normalizeMessageProcessing(response: Record<string, unknown>): AgentResponse['messageProcessing'] {
  let messageProcessing = response.messageProcessing;

  // Handle nested data wrapper (from sendSuccess)
  if (!messageProcessing && response.data && typeof response.data === 'object') {
    const dataObj = response.data as Record<string, unknown>;
    messageProcessing = dataObj.messageProcessing;
  }

  if (!messageProcessing || typeof messageProcessing !== 'object') {
    return undefined;
  }

  const mpObj = messageProcessing as Record<string, unknown>;

  // Extract processors object
  if (!mpObj.processors || typeof mpObj.processors !== 'object') {
    return undefined;
  }

  const processorsObj = mpObj.processors as Record<string, unknown>;
  const processors: NonNullable<AgentResponse['messageProcessing']>['processors'] = {};

  // Normalize each processor
  for (const [name, value] of Object.entries(processorsObj)) {
    if (!value || typeof value !== 'object') continue;

    const p = value as Record<string, unknown>;
    const baseProcessor = {
      activated: Boolean(p.activated),
      producesDynamicContent: typeof p.producesDynamicContent === 'boolean' ? p.producesDynamicContent : undefined,
    };

    // Handle condenser-specific fields
    if (name === 'condenser') {
      processors.condenser = {
        ...baseProcessor,
        totalMessages: Number(p.totalMessages ?? 0),
        recentMessages: Number(p.recentMessages ?? 0),
        condensedMessages: Number(p.condensedMessages ?? 0),
        selectionMode: (p.selectionMode === 'token-based' ? 'token-based' : 'turn-based') as 'turn-based' | 'token-based',
        summary: typeof p.summary === 'string' ? p.summary : null,
      };
    }
    // Handle pruner-specific fields
    else if (name === 'pruner') {
      processors.pruner = {
        ...baseProcessor,
        partsRemoved: Number(p.partsRemoved ?? 0),
      };
    }
    // Handle tokenLimiter-specific fields
    else if (name === 'tokenLimiter') {
      processors.tokenLimiter = {
        ...baseProcessor,
        messagesRemoved: typeof p.messagesRemoved === 'number' ? p.messagesRemoved : undefined,
      };
    }
    // Handle generic processors
    else {
      processors[name] = baseProcessor;
    }
  }

  return { processors };
}
