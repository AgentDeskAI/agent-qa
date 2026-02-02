import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getConfig,
  parseTimeRange,
  isTempoReachable,
  getStatus,
  fetchTrace,
  fetchTraces,
  searchTraces,
  searchByCorrelationId,
  getTraceByCorrelationId,
} from '../client.js'

describe('getConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns default values when no env vars set', () => {
    delete process.env.TEMPO_URL
    delete process.env.TEMPO_TIMEOUT

    const config = getConfig()

    expect(config.baseUrl).toBe('http://localhost:3200')
    expect(config.timeout).toBe(30000)
  })

  it('uses TEMPO_URL env var', () => {
    process.env.TEMPO_URL = 'http://custom-tempo:3200'

    const config = getConfig()

    expect(config.baseUrl).toBe('http://custom-tempo:3200')
  })

  it('uses TEMPO_TIMEOUT env var', () => {
    process.env.TEMPO_TIMEOUT = '5000'

    const config = getConfig()

    expect(config.timeout).toBe(5000)
  })
})

describe('parseTimeRange', () => {
  it('parses minutes', () => {
    expect(parseTimeRange('15m')).toBe(900)
    expect(parseTimeRange('30m')).toBe(1800)
    expect(parseTimeRange('1m')).toBe(60)
  })

  it('parses hours', () => {
    expect(parseTimeRange('1h')).toBe(3600)
    expect(parseTimeRange('24h')).toBe(86400)
    expect(parseTimeRange('6h')).toBe(21600)
  })

  it('parses days', () => {
    expect(parseTimeRange('1d')).toBe(86400)
    expect(parseTimeRange('7d')).toBe(604800)
    expect(parseTimeRange('30d')).toBe(2592000)
  })

  it('throws on invalid format', () => {
    expect(() => parseTimeRange('invalid')).toThrow('Invalid time range')
    expect(() => parseTimeRange('15')).toThrow('Invalid time range')
    expect(() => parseTimeRange('15x')).toThrow('Invalid time range')
    expect(() => parseTimeRange('')).toThrow('Invalid time range')
  })
})

describe('isTempoReachable', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when Tempo responds OK', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    const result = await isTempoReachable()

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3200/ready',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('returns false when Tempo responds with error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const result = await isTempoReachable()

    expect(result).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await isTempoReachable()

    expect(result).toBe(false)
  })
})

describe('getStatus', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns reachable status with URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    const status = await getStatus()

    expect(status.reachable).toBe(true)
    expect(status.url).toBe('http://localhost:3200')
  })

  it('returns unreachable status with URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const status = await getStatus()

    expect(status.reachable).toBe(false)
    expect(status.url).toBe('http://localhost:3200')
  })
})

describe('fetchTrace', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches trace by ID', async () => {
    const mockResponse = { batches: [] }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await fetchTrace('abc123')

    expect(result).toEqual(mockResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3200/api/traces/abc123',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('throws on 404 with specific message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    await expect(fetchTrace('nonexistent')).rejects.toThrow(
      'Trace not found: nonexistent'
    )
  })

  it('throws on other errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(fetchTrace('abc123')).rejects.toThrow(
      'Tempo fetch failed: 500 Internal Server Error'
    )
  })
})

describe('searchTraces', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('searches with no options', async () => {
    const mockResponse = { traces: [] }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await searchTraces()

    expect(result).toEqual(mockResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3200/api/search?',
      expect.any(Object)
    )
  })

  it('includes limit in query params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    await searchTraces({ limit: 10 })

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('limit=10')
  })

  it('includes service name in TraceQL query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    await searchTraces({ service: 'my-service' })

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('q=')
    // URL encodes spaces as +, so decode and replace + with spaces
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ')
    expect(decoded).toContain('resource.service.name = "my-service"')
  })

  it('includes correlation ID in TraceQL query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    await searchTraces({ correlationId: 'conv_123' })

    const url = mockFetch.mock.calls[0][0]
    // URL encodes spaces as +, so decode and replace + with spaces
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ')
    expect(decoded).toContain('span.ai.correlation_id = "conv_123"')
  })

  it('combines multiple tags with &&', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    await searchTraces({ service: 'svc', correlationId: 'conv' })

    const url = mockFetch.mock.calls[0][0]
    expect(decodeURIComponent(url)).toContain('&&')
  })

  it('includes custom tags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    await searchTraces({ tags: 'custom.tag="value"' })

    const url = mockFetch.mock.calls[0][0]
    expect(decodeURIComponent(url)).toContain('custom.tag="value"')
  })

  it('throws on search error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    })

    await expect(searchTraces()).rejects.toThrow(
      'Tempo search failed: 400 Bad Request'
    )
  })
})

describe('fetchTraces', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches multiple traces in parallel', async () => {
    const mockResponse1 = { batches: [{ id: 1 }] }
    const mockResponse2 = { batches: [{ id: 2 }] }
    const mockResponse3 = { batches: [{ id: 3 }] }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse1),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse2),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse3),
      })

    const results = await fetchTraces(['id1', 'id2', 'id3'])

    expect(results).toHaveLength(3)
    expect(results[0]).toEqual(mockResponse1)
    expect(results[1]).toEqual(mockResponse2)
    expect(results[2]).toEqual(mockResponse3)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('returns empty array for empty input', async () => {
    const results = await fetchTraces([])

    expect(results).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects if any trace fetch fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ batches: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

    await expect(fetchTraces(['id1', 'id2'])).rejects.toThrow(
      'Trace not found: id2'
    )
  })
})

describe('searchByCorrelationId', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('searches with correlation ID and default options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    await searchByCorrelationId('conv_abc123')

    const url = mockFetch.mock.calls[0][0]
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ')
    expect(decoded).toContain('span.ai.correlation_id = "conv_abc123"')
    expect(url).toContain('limit=10') // Default limit
  })

  it('uses custom since option for time window', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    const beforeCall = Math.floor(Date.now() / 1000)
    await searchByCorrelationId('conv_123', { since: 3600 })
    const afterCall = Math.floor(Date.now() / 1000)

    const url = mockFetch.mock.calls[0][0]
    const startMatch = url.match(/start=(\d+)/)
    const endMatch = url.match(/end=(\d+)/)

    expect(startMatch).not.toBeNull()
    expect(endMatch).not.toBeNull()

    const start = parseInt(startMatch![1], 10)
    const end = parseInt(endMatch![1], 10)

    // Start should be approximately now - 3600
    expect(start).toBeGreaterThanOrEqual(beforeCall - 3600 - 1)
    expect(start).toBeLessThanOrEqual(afterCall - 3600 + 1)
    // End should be approximately now
    expect(end).toBeGreaterThanOrEqual(beforeCall)
    expect(end).toBeLessThanOrEqual(afterCall + 1)
  })

  it('passes custom limit option', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    await searchByCorrelationId('conv_123', { limit: 25 })

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('limit=25')
  })
})

describe('getTraceByCorrelationId', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when no traces found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ traces: [] }),
    })

    const result = await getTraceByCorrelationId('unknown_conv')

    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1) // Only search, no fetch
  })

  it('fetches and returns first matching trace', async () => {
    const mockTraceResponse = { batches: [{ id: 'trace-data' }] }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ traces: [{ traceID: 'trace-123' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTraceResponse),
      })

    const result = await getTraceByCorrelationId('conv_abc')

    expect(result).toEqual(mockTraceResponse)
    expect(mockFetch).toHaveBeenCalledTimes(2) // search + fetch
    expect(mockFetch.mock.calls[1][0]).toContain('/api/traces/trace-123')
  })
})

describe('timeout handling', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('throws timeout error when fetchTrace times out', async () => {
    // Create an AbortError
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'

    mockFetch.mockRejectedValueOnce(abortError)

    await expect(fetchTrace('slow-trace')).rejects.toThrow(
      'Tempo fetch timed out after 30000ms'
    )
  })

  it('throws timeout error when searchTraces times out', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'

    mockFetch.mockRejectedValueOnce(abortError)

    await expect(searchTraces({ limit: 10 })).rejects.toThrow(
      'Tempo search timed out after 30000ms'
    )
  })

  it('propagates non-abort errors from fetchTrace', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetchTrace('some-trace')).rejects.toThrow('Network failure')
  })

  it('propagates non-abort errors from searchTraces', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

    await expect(searchTraces()).rejects.toThrow('Connection refused')
  })
})
