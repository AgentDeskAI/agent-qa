/**
 * Tempo HTTP API client
 * Queries traces from Grafana Tempo
 */

import type { TempoResponse, TempoSearchResult } from './types/index.js'

const DEFAULT_TEMPO_URL = 'http://localhost:3200'
const DEFAULT_TIMEOUT = 30000

export interface TempoConfig {
  baseUrl: string
  timeout: number
}

export function getConfig(): TempoConfig {
  return {
    baseUrl: process.env.TEMPO_URL || DEFAULT_TEMPO_URL,
    timeout: parseInt(process.env.TEMPO_TIMEOUT || String(DEFAULT_TIMEOUT), 10),
  }
}

export interface SearchOptions {
  limit?: number
  start?: number // Unix timestamp in seconds
  end?: number // Unix timestamp in seconds
  service?: string
  correlationId?: string
  tags?: string // Raw tags query
}

/**
 * Check if Tempo is reachable
 */
export async function isTempoReachable(): Promise<boolean> {
  const config = getConfig()
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${config.baseUrl}/ready`, {
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Get Tempo status info
 */
export async function getStatus(): Promise<{
  reachable: boolean
  url: string
  version?: string
}> {
  const config = getConfig()
  const reachable = await isTempoReachable()

  return {
    reachable,
    url: config.baseUrl,
  }
}

/**
 * Search for traces
 */
export async function searchTraces(
  options?: SearchOptions
): Promise<TempoSearchResult> {
  const config = getConfig()
  const params = new URLSearchParams()

  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.start) params.set('start', String(options.start))
  if (options?.end) params.set('end', String(options.end))

  // Build TraceQL query (more powerful than old tags format)
  // TraceQL syntax for attributes with dots: "attribute.name" = "value"
  const conditions: string[] = []
  if (options?.service) {
    conditions.push(`resource.service.name = "${options.service}"`)
  }
  if (options?.correlationId) {
    // Span attributes use the span. prefix in TraceQL
    conditions.push(`span.ai.correlation_id = "${options.correlationId}"`)
  }
  if (options?.tags) {
    // Raw TraceQL condition
    conditions.push(options.tags)
  }

  if (conditions.length > 0) {
    // TraceQL query format: { condition1 && condition2 }
    params.set('q', `{ ${conditions.join(' && ')} }`)
  }

  const url = `${config.baseUrl}/api/search?${params}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeout)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      throw new Error(`Tempo search failed: ${res.status} ${res.statusText}`)
    }

    return res.json() as Promise<TempoSearchResult>
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Tempo search timed out after ${config.timeout}ms`)
    }
    throw error
  }
}

/**
 * Fetch a single trace by ID
 */
export async function fetchTrace(traceId: string): Promise<TempoResponse> {
  const config = getConfig()
  const url = `${config.baseUrl}/api/traces/${traceId}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeout)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Trace not found: ${traceId}`)
      }
      throw new Error(`Tempo fetch failed: ${res.status} ${res.statusText}`)
    }

    return res.json() as Promise<TempoResponse>
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Tempo fetch timed out after ${config.timeout}ms`)
    }
    throw error
  }
}

/**
 * Fetch multiple traces by IDs
 */
export async function fetchTraces(traceIds: string[]): Promise<TempoResponse[]> {
  return Promise.all(traceIds.map(fetchTrace))
}

/**
 * Search by correlation ID and return matching traces
 */
export async function searchByCorrelationId(
  correlationId: string,
  options?: { limit?: number; since?: number }
): Promise<TempoSearchResult> {
  const now = Math.floor(Date.now() / 1000)
  const start = options?.since
    ? now - options.since
    : now - 24 * 60 * 60 // Default to last 24 hours

  return searchTraces({
    correlationId,
    start,
    end: now,
    limit: options?.limit || 10,
  })
}

/**
 * Get trace by correlation ID (search + fetch)
 */
export async function getTraceByCorrelationId(
  correlationId: string
): Promise<TempoResponse | null> {
  const searchResult = await searchByCorrelationId(correlationId, { limit: 1 })

  if (searchResult.traces.length === 0) {
    return null
  }

  return fetchTrace(searchResult.traces[0].traceID)
}

/**
 * Parse time range string to seconds
 */
export function parseTimeRange(timeRange: string): number {
  const match = timeRange.match(/^(\d+)(m|h|d)$/)
  if (!match) {
    throw new Error(
      `Invalid time range: ${timeRange}. Use format like 15m, 1h, 24h, 7d`
    )
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'm':
      return value * 60
    case 'h':
      return value * 60 * 60
    case 'd':
      return value * 24 * 60 * 60
    default:
      throw new Error(`Unknown time unit: ${unit}`)
  }
}
