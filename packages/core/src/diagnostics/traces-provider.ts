/**
 * Generic Traces Provider for Diagnostics
 *
 * Uses the TracesProvider interface to fetch traces from any backend
 * (Tempo, LangFuse, Jaeger, etc.) for failure diagnostics.
 */

import type {
  DiagnosticsProvider,
  FailureContext,
  DiagnosticsData,
} from './types.js';
import type {
  TracesProvider,
  TracesProviderConfig,
  ParsedTrace,
  ParsedSpan,
} from '../traces/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Workflow data extracted from orchestrator span attributes.
 */
export interface WorkflowData {
  costs: {
    total: number;
    inputCost: number;
    outputCost: number;
    byAgent: Record<string, number>;
  };
  tokenCategories: {
    input: Record<string, number>;
    output: Record<string, number>;
    byAgent: Record<string, {
      input: Record<string, number>;
      output: Record<string, number>;
    }>;
  };
  accuracy: {
    inputDelta: number;
    outputDelta: number;
    inputPercent: number;
    outputPercent: number;
  };
}

/**
 * Enriched trace data returned in raw field.
 */
export interface EnrichedTraceData {
  traceId: string;
  correlationId: string;
  spans: ParsedSpan[];
  metrics: ParsedTrace['metrics'];
  rootSpan: ParsedSpan | null;
  workflowData: WorkflowData | null;
}

// =============================================================================
// Generic Traces Diagnostics Provider
// =============================================================================

/**
 * Create a diagnostics provider using a TracesProvider.
 *
 * This is the recommended way to add trace diagnostics. It works with any
 * backend that implements the TracesProvider interface.
 *
 * @example
 * ```typescript
 * import { createTracesProvider } from '@agent-qa/traces-tempo';
 *
 * const tracesProvider = createTracesProvider({
 *   url: 'http://localhost:3200',
 * });
 *
 * // In config
 * diagnostics: {
 *   traces: { provider: tracesProvider }
 * }
 * ```
 */
export function createTracesDiagnosticsProvider(
  config: TracesProviderConfig
): DiagnosticsProvider {
  const { provider, includeSpans = true } = config;

  return {
    name: `traces-${provider.name}`,
    deferred: true, // Trace queries are slow, collect at suite end

    async collect(context: FailureContext): Promise<DiagnosticsData | null> {
      // Require correlation ID to search
      if (!context.correlationId) {
        console.log(`[${provider.name}] No correlationId provided, skipping trace collection`);
        return null;
      }

      console.log(`[${provider.name}] Collecting trace for correlationId: ${context.correlationId}`);

      try {
        // Check if provider is reachable
        const reachable = await provider.isReachable();
        if (!reachable) {
          console.log(`[${provider.name}] Provider is not reachable`);
          return null;
        }

        console.log(`[${provider.name}] Provider is reachable, searching for trace...`);

        // Retry logic for trace indexing delays
        const maxRetries = 20;
        const retryDelayMs = 3000;
        let trace: ParsedTrace | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          trace = await provider.getTraceByCorrelationId(context.correlationId);

          if (trace) {
            break;
          }

          if (attempt < maxRetries) {
            console.log(`[${provider.name}] Trace not found yet, waiting ${retryDelayMs}ms (attempt ${attempt}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
        }

        if (!trace) {
          console.log(`[${provider.name}] No trace found for correlationId after retries`);
          return null;
        }

        console.log(`[${provider.name}] Trace found, parsing...`);

        // Find orchestrator span (has ai.workflow.* attributes)
        const orchestratorSpan = trace.spans.find(
          (s) => s.spanType === 'orchestrator' || s.name.includes('orchestrator')
        );

        // Extract workflow data from orchestrator attributes
        const workflowData = orchestratorSpan
          ? extractWorkflowData(orchestratorSpan.attributes)
          : null;

        console.log(`[${provider.name}] Extracted workflow data: ${workflowData ? 'yes' : 'no'}`);

        return {
          type: 'trace',
          title: `OpenTelemetry Trace (${provider.name})`,
          content: formatTraceAsMarkdown(trace, context, includeSpans),
          raw: {
            traceId: trace.traceId,
            correlationId: context.correlationId,
            spans: trace.spans,
            metrics: trace.metrics,
            rootSpan: trace.rootSpan,
            workflowData,
          } as EnrichedTraceData,
        };
      } catch (error) {
        // Log error but don't fail - diagnostics are optional
        console.error(`[${provider.name}] Failed to fetch trace:`, error);
        return null;
      }
    },
  };
}

// =============================================================================
// Batch Trace Collection
// =============================================================================

/**
 * Collect traces for multiple correlationIds using a TracesProvider.
 *
 * @param provider - The traces provider to use
 * @param correlationIds - Array of correlationIds to fetch traces for
 * @returns Array of enriched trace data (null entries filtered out)
 */
export async function collectTracesForCorrelationIds(
  provider: TracesProvider,
  correlationIds: string[]
): Promise<EnrichedTraceData[]> {
  if (!correlationIds || correlationIds.length === 0) {
    return [];
  }

  console.log(`[${provider.name}] Collecting traces for ${correlationIds.length} correlationId(s)...`);

  try {
    // Check if provider is reachable
    const reachable = await provider.isReachable();
    if (!reachable) {
      console.log(`[${provider.name}] Provider is not reachable`);
      return [];
    }

    console.log(`[${provider.name}] Provider is reachable, fetching traces...`);

    // Retry logic for each correlation ID
    const maxRetries = 20;
    const retryDelayMs = 3000;

    const fetchWithRetry = async (correlationId: string): Promise<EnrichedTraceData | null> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const trace = await provider.getTraceByCorrelationId(correlationId);
          if (trace) {
            // Extract workflow data from orchestrator span
            const orchestratorSpan = trace.spans.find(
              (s) => s.spanType === 'orchestrator' || s.name.includes('orchestrator')
            );
            const workflowData = orchestratorSpan
              ? extractWorkflowData(orchestratorSpan.attributes)
              : null;

            return {
              correlationId,
              traceId: trace.traceId,
              spans: trace.spans,
              metrics: trace.metrics,
              rootSpan: trace.rootSpan,
              workflowData,
            };
          }
        } catch (error) {
          console.log(`[${provider.name}] Error fetching trace (attempt ${attempt}/${maxRetries}):`, error instanceof Error ? error.message : error);
        }

        if (attempt < maxRetries) {
          console.log(`[${provider.name}] Trace not found yet, waiting ${retryDelayMs}ms (attempt ${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
      console.log(`[${provider.name}] No trace found for correlationId after ${maxRetries} attempts: ${correlationId}`);
      return null;
    };

    // Fetch all traces in parallel
    const results = await Promise.allSettled(
      correlationIds.map(fetchWithRetry)
    );

    // Filter successful results that returned data
    const traces = results
      .filter(
        (r): r is PromiseFulfilledResult<EnrichedTraceData | null> =>
          r.status === 'fulfilled' && r.value !== null
      )
      .map((r) => r.value!);

    console.log(`[${provider.name}] Collected ${traces.length}/${correlationIds.length} traces`);
    return traces;
  } catch (error) {
    console.error(`[${provider.name}] Failed to collect traces:`, error);
    return [];
  }
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format a parsed trace as markdown for reports.
 */
function formatTraceAsMarkdown(
  trace: ParsedTrace,
  context: FailureContext,
  includeSpans: boolean
): string {
  const lines: string[] = [];

  // Header
  lines.push(`**Trace ID:** \`${trace.traceId}\``);
  lines.push(`**Correlation ID:** \`${context.correlationId}\``);
  lines.push('');

  // Root span summary
  if (trace.rootSpan) {
    lines.push('#### Root Span');
    lines.push(`- **Name:** ${trace.rootSpan.name}`);
    lines.push(`- **Service:** ${trace.rootSpan.serviceName ?? trace.serviceName}`);
    lines.push(`- **Duration:** ${formatDuration(trace.rootSpan.duration)}`);
    lines.push(`- **Status:** ${trace.rootSpan.status}`);
    lines.push('');
  }

  // Metrics
  if (trace.metrics) {
    lines.push('#### Metrics');
    if (trace.metrics.totalDuration !== undefined) {
      lines.push(`- **Total Duration:** ${formatDuration(trace.metrics.totalDuration)}`);
    }
    if (trace.metrics.spanCount !== undefined) {
      lines.push(`- **Span Count:** ${trace.metrics.spanCount}`);
    }
    if (trace.metrics.serviceCount !== undefined) {
      lines.push(`- **Service Count:** ${trace.metrics.serviceCount}`);
    }
    if (trace.metrics.errorCount !== undefined) {
      lines.push(`- **Error Count:** ${trace.metrics.errorCount}`);
    }
    // Always show token metrics
    lines.push(`- **Total Tokens:** ${trace.metrics.totalTokens.toLocaleString()}`);
    if (trace.metrics.costUsd > 0) {
      lines.push(`- **Est. Cost:** $${trace.metrics.costUsd.toFixed(4)}`);
    }
    lines.push('');
  }

  // Span details
  if (includeSpans && trace.spans.length > 0) {
    lines.push('#### Spans');
    lines.push('');

    // Group spans by service for readability
    const byService = groupSpansByService(trace.spans);

    for (const [service, spans] of byService) {
      lines.push(`##### ${service}`);
      lines.push('');

      for (const span of spans) {
        const statusIcon =
          span.status === 'error' ? '!' : span.status === 'ok' ? '+' : '-';
        lines.push(
          `[${statusIcon}] **${span.name}** (${formatDuration(span.duration)})`
        );

        // Show important attributes
        const importantAttrs = extractImportantAttributes(span.attributes);
        if (importantAttrs.length > 0) {
          for (const [key, value] of importantAttrs) {
            lines.push(`   - ${key}: \`${formatValue(value)}\``);
          }
        }

        // Show errors/exceptions
        const errorEvents = (span.events ?? []).filter(
          (e) => e.name === 'exception' || e.name.toLowerCase().includes('error')
        );
        for (const event of errorEvents) {
          lines.push(
            `   - Error: ${event.attributes['exception.message'] || event.name}`
          );
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Group spans by service name.
 */
function groupSpansByService(
  spans: ParsedSpan[]
): Map<string, ParsedSpan[]> {
  const groups = new Map<string, ParsedSpan[]>();

  for (const span of spans) {
    const service = span.serviceName || 'unknown';
    if (!groups.has(service)) {
      groups.set(service, []);
    }
    groups.get(service)!.push(span);
  }

  return groups;
}

/**
 * Extract important attributes for display.
 */
function extractImportantAttributes(
  attributes: Record<string, unknown>
): Array<[string, unknown]> {
  const important = [
    'ai.model',
    'ai.prompt.tokens',
    'ai.completion.tokens',
    'ai.total.tokens',
    'http.method',
    'http.url',
    'http.status_code',
    'db.operation',
    'db.statement',
    'error.type',
    'error.message',
  ];

  const result: Array<[string, unknown]> = [];

  for (const key of important) {
    if (key in attributes) {
      result.push([key, attributes[key]]);
    }
  }

  return result;
}

/**
 * Format duration in milliseconds to human readable.
 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}us`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 100 ? value.slice(0, 100) + '...' : value;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, 100);
  }
  return String(value);
}

// =============================================================================
// Workflow Data Extraction
// =============================================================================

/**
 * Extract workflow data from orchestrator span attributes.
 * These attributes contain aggregated costs, token categories, and accuracy metrics.
 */
function extractWorkflowData(
  attrs: Record<string, string | number | boolean>
): WorkflowData {
  return {
    costs: {
      total: Number(attrs['ai.workflow.cost.total_usd'] ?? 0),
      inputCost: Number(attrs['ai.workflow.cost.input_usd'] ?? 0),
      outputCost: Number(attrs['ai.workflow.cost.output_usd'] ?? 0),
      byAgent: extractByPattern(attrs, /^ai\.workflow\.agent\.(.+?)\.cost_usd$/),
    },
    tokenCategories: {
      input: extractByPattern(attrs, /^ai\.workflow\.tokens\.input\.(.+)$/),
      output: extractByPattern(attrs, /^ai\.workflow\.tokens\.output\.(.+)$/),
      byAgent: extractAgentTokenCategories(attrs),
    },
    accuracy: {
      inputDelta: Number(attrs['ai.workflow.accuracy.input.delta'] ?? 0),
      outputDelta: Number(attrs['ai.workflow.accuracy.output.delta'] ?? 0),
      inputPercent: Number(attrs['ai.workflow.accuracy.input.percentage'] ?? 0),
      outputPercent: Number(attrs['ai.workflow.accuracy.output.percentage'] ?? 0),
    },
  };
}

/**
 * Extract numeric values matching a pattern from attributes.
 * The first capture group becomes the key.
 */
function extractByPattern(
  attrs: Record<string, string | number | boolean>,
  pattern: RegExp
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const match = key.match(pattern);
    if (match) {
      result[match[1]] = Number(value);
    }
  }
  return result;
}

/**
 * Extract per-agent token categories from attributes.
 * Pattern: ai.workflow.agent.{agentId}.tokens.{input|output}.{category}
 */
function extractAgentTokenCategories(
  attrs: Record<string, string | number | boolean>
): Record<string, { input: Record<string, number>; output: Record<string, number> }> {
  const byAgent: Record<string, { input: Record<string, number>; output: Record<string, number> }> = {};
  const pattern = /^ai\.workflow\.agent\.(.+?)\.tokens\.(input|output)\.(.+)$/;

  for (const [key, value] of Object.entries(attrs)) {
    const match = key.match(pattern);
    if (match) {
      const [, agentId, direction, category] = match;
      if (!byAgent[agentId]) {
        byAgent[agentId] = { input: {}, output: {} };
      }
      byAgent[agentId][direction as 'input' | 'output'][category] = Number(value);
    }
  }
  return byAgent;
}
