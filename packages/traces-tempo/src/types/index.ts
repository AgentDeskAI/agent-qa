// Tempo API types
export type {
  TempoSearchResult,
  TempoResponse,
  Batch,
  Resource,
  InstrumentationLibrarySpans,
  InstrumentationLibrary,
  ScopeSpans,
  Scope,
  Span,
  SpanKind,
  SpanStatus as TempoSpanStatus,
  Attribute,
  AttributeValue,
  SpanEvent,
} from './tempo.js'

// Processed trace types
export type {
  SpanType,
  SpanStatus,
  ParsedTrace,
  ParsedSpan,
  TraceMetrics,
  TraceSearchResult,
} from './trace.js'
