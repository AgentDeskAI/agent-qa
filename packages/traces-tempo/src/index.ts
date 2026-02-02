/**
 * @agent-qa/traces-tempo
 *
 * Grafana Tempo traces provider for the agent-qa framework.
 *
 * @example
 * ```typescript
 * import { createTempoProvider } from '@agent-qa/traces-tempo';
 *
 * const provider = createTempoProvider({
 *   url: 'http://localhost:3200',
 * });
 *
 * // Check availability
 * const reachable = await provider.isReachable();
 *
 * // Get trace by correlation ID
 * const trace = await provider.getTraceByCorrelationId('conv_123');
 * ```
 */

// =============================================================================
// Primary Export: TracesProvider Implementation
// =============================================================================

export {
  createTempoProvider,
  parseTimeRange,
  type TempoProviderConfig,
} from './provider.js';

// =============================================================================
// Re-export TracesProvider types from core for convenience
// =============================================================================

export type {
  TracesProvider,
  TracesProviderStatus,
  TraceSearchOptions,
} from '@agent-qa/core/traces';

// =============================================================================
// Legacy/Low-level Client Functions
// (For backward compatibility and advanced use cases)
// =============================================================================

export {
  fetchTrace,
  fetchTraces,
  searchTraces,
  searchByCorrelationId,
  getTraceByCorrelationId,
  isTempoReachable,
  getStatus,
  getConfig,
  type TempoConfig,
  type SearchOptions,
} from './client.js';

// Parser functions
export { parseTempoResponse } from './parser.js';

// =============================================================================
// Types - Tempo API (Backend-specific)
// =============================================================================

export type {
  TempoSearchResult,
  TempoResponse,
  Batch,
  Resource,
  ScopeSpans,
  Scope,
  Span,
  SpanKind,
  Attribute,
  AttributeValue,
  SpanEvent,
  TempoSpanStatus,
} from './types/index.js';

// =============================================================================
// Types - Parsed Traces (Re-exported from core for convenience)
// =============================================================================

export type {
  ParsedTrace,
  ParsedSpan,
  SpanType,
  SpanStatus,
  TraceMetrics,
  TraceSearchResult,
} from './types/index.js';
