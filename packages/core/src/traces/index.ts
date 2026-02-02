/**
 * Traces Module
 *
 * Provides the TracesProvider interface for pluggable tracing backends
 * and backend-agnostic trace types.
 *
 * @example
 * ```typescript
 * import type { TracesProvider, ParsedTrace } from '@agent-qa/core/traces';
 *
 * // Use with Tempo
 * import { createTempoProvider } from '@agent-qa/traces-tempo';
 * const provider = createTempoProvider({ url: 'http://localhost:3200' });
 *
 * // Or implement your own
 * const myProvider: TracesProvider = {
 *   name: 'my-backend',
 *   async isReachable() { return true; },
 *   async getTraceByCorrelationId(id) { return myGetTrace(id); },
 * };
 * ```
 */

// Provider interface and config
export type {
  TracesProvider,
  TracesProviderConfig,
  TracesProviderStatus,
  TraceSearchOptions,
} from './types.js';

// Domain types (backend-agnostic)
export type {
  ParsedTrace,
  ParsedSpan,
  SpanEvent,
  TraceMetrics,
  TraceSearchResult,
  SpanType,
  SpanStatus,
} from './types.js';
