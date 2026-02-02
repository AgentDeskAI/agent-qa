/**
 * Tempo API response types
 * Supports both legacy (instrumentationLibrarySpans) and modern (scopeSpans) OTLP formats
 */

export interface TempoSearchResult {
  traces: Array<{
    traceID: string
    rootServiceName: string
    rootTraceName: string
    startTimeUnixNano: string
    durationMs: number
  }>
}

export interface TempoResponse {
  batches: Batch[]
}

export interface Batch {
  resource: Resource
  instrumentationLibrarySpans?: InstrumentationLibrarySpans[]
  scopeSpans?: ScopeSpans[]
}

export interface Resource {
  attributes: Attribute[]
  droppedAttributesCount?: number
}

export interface InstrumentationLibrarySpans {
  spans: Span[]
  instrumentationLibrary: InstrumentationLibrary
}

export interface InstrumentationLibrary {
  name: string
  version?: string
}

export interface ScopeSpans {
  spans: Span[]
  scope: Scope
}

export interface Scope {
  name: string
  version?: string
}

export interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  traceState?: string
  name: string
  kind: SpanKind
  startTimeUnixNano: number | string
  endTimeUnixNano: number | string
  attributes: Attribute[]
  droppedAttributesCount?: number
  droppedEventsCount?: number
  droppedLinksCount?: number
  status: SpanStatus
  events?: SpanEvent[]
}

export type SpanKind =
  | 'SPAN_KIND_INTERNAL'
  | 'SPAN_KIND_SERVER'
  | 'SPAN_KIND_CLIENT'
  | 'SPAN_KIND_PRODUCER'
  | 'SPAN_KIND_CONSUMER'

export interface SpanStatus {
  code?: number | string
  message?: string
}

export interface Attribute {
  key: string
  value: AttributeValue
}

export interface AttributeValue {
  stringValue?: string
  intValue?: number | string
  doubleValue?: number
  boolValue?: boolean
  arrayValue?: { values: AttributeValue[] }
}

export interface SpanEvent {
  timeUnixNano: number | string
  name: string
  attributes: Attribute[]
  droppedAttributesCount?: number
}
