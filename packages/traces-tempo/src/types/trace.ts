/**
 * Processed trace types for display
 *
 * These types are re-exported from @agent-qa/core/traces for backward compatibility.
 * New code should import directly from '@agent-qa/core/traces'.
 *
 * @deprecated Import from '@agent-qa/core/traces' instead
 */

// Re-export all trace types from core
export type {
  SpanType,
  SpanStatus,
  ParsedTrace,
  ParsedSpan,
  TraceMetrics,
  TraceSearchResult,
} from '@agent-qa/core/traces';
