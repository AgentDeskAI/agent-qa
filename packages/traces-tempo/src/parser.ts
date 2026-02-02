/**
 * Parse OTLP trace responses into a structured format
 */

import type {
  TempoResponse,
  Batch,
  Span,
  Attribute,
  AttributeValue,
} from './types/tempo.js'
import type {
  ParsedTrace,
  ParsedSpan,
  SpanType,
  SpanStatus,
  TraceMetrics,
} from './types/trace.js'

/**
 * Parse a Tempo response into a ParsedTrace
 */
export function parseTempoResponse(response: TempoResponse): ParsedTrace | null {
  const allSpans: Array<{
    span: Span
    serviceName: string
  }> = []

  // Collect all spans from all batches
  for (const batch of response.batches) {
    const serviceName = getResourceAttribute(batch, 'service.name') || 'unknown'
    const spans = extractSpansFromBatch(batch)

    for (const span of spans) {
      allSpans.push({ span, serviceName })
    }
  }

  if (allSpans.length === 0) {
    return null
  }

  // Find root span (no parent or parent not in trace)
  const spanIds = new Set(allSpans.map((s) => s.span.spanId))
  const rootSpanData = allSpans.find(
    (s) => !s.span.parentSpanId || !spanIds.has(normalizeSpanId(s.span.parentSpanId))
  )

  if (!rootSpanData) {
    return null
  }

  // Build span hierarchy
  const parsedSpans = allSpans.map(({ span, serviceName }) =>
    parseSpan(span, serviceName)
  )

  // Build parent-child relationships
  const spanMap = new Map<string, ParsedSpan>()
  for (const span of parsedSpans) {
    spanMap.set(span.id, span)
  }

  for (const span of parsedSpans) {
    if (span.parentId) {
      const normalizedParentId = normalizeSpanId(span.parentId)
      const parent = spanMap.get(normalizedParentId)
      if (parent) {
        parent.children.push(span)
        span.depth = parent.depth + 1
      }
    }
  }

  // Calculate depths for all spans
  const rootSpan = spanMap.get(normalizeSpanId(rootSpanData.span.spanId))
  if (rootSpan) {
    calculateDepths(rootSpan, 0)
  }

  // Calculate metrics
  const metrics = calculateMetrics(parsedSpans)

  // Find trace-level info
  const traceId = rootSpanData.span.traceId
  const startTime = new Date(parseNanoTimestamp(rootSpanData.span.startTimeUnixNano))
  const endTime = new Date(parseNanoTimestamp(rootSpanData.span.endTimeUnixNano))

  return {
    traceId,
    serviceName: rootSpanData.serviceName,
    rootSpanName: rootSpanData.span.name,
    startTime,
    endTime,
    duration: endTime.getTime() - startTime.getTime(),
    status: parseStatusCode(rootSpanData.span.status?.code),
    spans: parsedSpans,
    rootSpan: rootSpan || null,
    metrics,
  }
}

/**
 * Extract spans from a batch (handles both legacy and modern formats)
 */
function extractSpansFromBatch(batch: Batch): Span[] {
  const spans: Span[] = []

  // Modern format (scopeSpans)
  if (batch.scopeSpans) {
    for (const scope of batch.scopeSpans) {
      spans.push(...scope.spans)
    }
  }

  // Legacy format (instrumentationLibrarySpans)
  if (batch.instrumentationLibrarySpans) {
    for (const lib of batch.instrumentationLibrarySpans) {
      spans.push(...lib.spans)
    }
  }

  return spans
}

/**
 * Parse a single span
 */
function parseSpan(span: Span, _serviceName: string): ParsedSpan {
  const startTime = new Date(parseNanoTimestamp(span.startTimeUnixNano))
  const endTime = new Date(parseNanoTimestamp(span.endTimeUnixNano))
  const attributes = flattenAttributes(span.attributes)

  return {
    id: normalizeSpanId(span.spanId),
    parentId: span.parentSpanId ? normalizeSpanId(span.parentSpanId) : null,
    traceId: span.traceId,
    name: span.name,
    displayName: getDisplayName(span, attributes),
    spanType: getSpanType(span, attributes),
    startTime,
    endTime,
    duration: endTime.getTime() - startTime.getTime(),
    status: parseStatusCode(span.status?.code),
    statusMessage: span.status?.message || '',
    attributes,
    children: [],
    depth: 0,
  }
}

/**
 * Get a resource attribute from a batch
 */
function getResourceAttribute(batch: Batch, key: string): string | undefined {
  const attributes = batch.resource?.attributes
  if (!attributes) {
    return undefined
  }
  const attr = attributes.find((a) => a.key === key)
  const value = attr ? getAttributeValue(attr.value) : undefined
  return typeof value === 'string' ? value : undefined
}

/**
 * Normalize span ID (handle base64 encoding)
 */
function normalizeSpanId(spanId: string): string {
  // If it looks like base64 (contains +, /, or =), decode it
  if (/[+/=]/.test(spanId)) {
    try {
      const bytes = atob(spanId)
      return Array.from(bytes)
        .map((b) => b.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    } catch {
      return spanId
    }
  }
  return spanId
}

/**
 * Parse nanosecond timestamp to milliseconds
 */
function parseNanoTimestamp(value: number | string): number {
  const nanos = typeof value === 'string' ? parseInt(value, 10) : value
  return Math.floor(nanos / 1_000_000)
}

/**
 * Parse status code to SpanStatus
 */
function parseStatusCode(code: number | string | undefined): SpanStatus {
  if (code === undefined || code === 0 || code === 'STATUS_CODE_UNSET') {
    return 'unset'
  }
  if (code === 1 || code === 'STATUS_CODE_OK') {
    return 'ok'
  }
  if (code === 2 || code === 'STATUS_CODE_ERROR') {
    return 'error'
  }
  return 'unset'
}

/**
 * Get attribute value as primitive
 */
function getAttributeValue(
  value: AttributeValue
): string | number | boolean | undefined {
  if (value.stringValue !== undefined) return value.stringValue
  if (value.intValue !== undefined) {
    return typeof value.intValue === 'string'
      ? parseInt(value.intValue, 10)
      : value.intValue
  }
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.boolValue !== undefined) return value.boolValue
  return undefined
}

/**
 * Flatten attributes to a simple record
 */
function flattenAttributes(
  attributes: Attribute[] | undefined
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}
  if (!attributes) {
    return result
  }
  for (const attr of attributes) {
    const value = getAttributeValue(attr.value)
    if (value !== undefined) {
      result[attr.key] = value
    }
  }
  return result
}

/**
 * Determine span type from span data
 */
function getSpanType(
  span: Span,
  attributes: Record<string, string | number | boolean>
): SpanType {
  const name = span.name.toLowerCase()

  // Check span kind first
  if (span.kind === 'SPAN_KIND_SERVER') {
    return 'http-server'
  }
  if (span.kind === 'SPAN_KIND_CLIENT') {
    if (attributes['db.system']) {
      return 'db'
    }
    return 'http-client'
  }

  // Check name patterns
  if (name.includes('orchestrator') || name === 'chat.orchestrator') {
    return 'orchestrator'
  }
  if (name.startsWith('ai.agent') || attributes['ai.agent_id']) {
    return 'agent'
  }
  if (name.startsWith('ai.tool') || name.startsWith('tool.')) {
    return 'tool'
  }
  if (name.startsWith('db.') || attributes['db.system']) {
    return 'db'
  }
  if (name.startsWith('ai.lifecycle') || name.includes('lifecycle')) {
    return 'lifecycle'
  }
  if (name.includes('llm') || attributes['gen_ai.system']) {
    return 'llm'
  }

  return 'internal'
}

/**
 * Get display-friendly name for a span
 */
function getDisplayName(
  span: Span,
  attributes: Record<string, string | number | boolean>
): string {
  const name = span.name

  // Agent spans: "router-agent" -> "Router Agent"
  if (name.startsWith('ai.agent.')) {
    const agentName = name.replace('ai.agent.', '')
    return agentName
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  // Tool spans: keep as-is
  if (name.startsWith('ai.tool.') || name.startsWith('tool.')) {
    return name
  }

  // DB spans: use last segment
  if (name.startsWith('db.')) {
    return name
  }

  // HTTP spans: method + path
  const method = attributes['http.method'] || attributes['http.request.method']
  const path = attributes['url.path'] || attributes['http.target']
  if (method && path) {
    return `${method} ${path}`
  }

  return name
}

/**
 * Calculate depths recursively
 */
function calculateDepths(span: ParsedSpan, depth: number): void {
  span.depth = depth
  for (const child of span.children) {
    calculateDepths(child, depth + 1)
  }
}

/**
 * Calculate trace metrics
 */
function calculateMetrics(spans: ParsedSpan[]): TraceMetrics {
  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  let costUsd = 0
  let agentCount = 0
  let toolCount = 0
  let dbOperations = 0
  let llmCalls = 0

  for (const span of spans) {
    // Token metrics
    if (span.attributes['gen_ai.usage.input_tokens']) {
      inputTokens += Number(span.attributes['gen_ai.usage.input_tokens'])
    }
    if (span.attributes['gen_ai.usage.output_tokens']) {
      outputTokens += Number(span.attributes['gen_ai.usage.output_tokens'])
    }
    if (span.attributes['gen_ai.usage.cache_read_tokens']) {
      cachedTokens += Number(span.attributes['gen_ai.usage.cache_read_tokens'])
    }

    // Cost
    if (span.attributes['ai.cost.total_usd']) {
      costUsd += Number(span.attributes['ai.cost.total_usd'])
    }

    // Counts by type
    switch (span.spanType) {
      case 'agent':
        agentCount++
        break
      case 'tool':
        toolCount++
        break
      case 'db':
        dbOperations++
        break
      case 'llm':
        llmCalls++
        break
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cachedTokens,
    costUsd,
    agentCount,
    toolCount,
    dbOperations,
    llmCalls,
  }
}
