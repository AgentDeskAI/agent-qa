import { describe, it, expect } from 'vitest'
import { parseTempoResponse } from '../parser.js'
import {
  simpleTempoResponse,
  emptyTempoResponse,
  emptyBatchesResponse,
} from './fixtures/tempo-response-simple.js'
import {
  nestedTempoResponse,
  errorTempoResponse,
} from './fixtures/tempo-response-nested.js'
import {
  metricsTempoResponse,
  operationsTempoResponse,
} from './fixtures/tempo-response-metrics.js'
import {
  booleanAttributeResponse,
  httpClientResponse,
  lifecycleSpanResponse,
  unknownStatusCodeResponse,
  stringStatusCodeResponse,
  dbNamePatternResponse,
} from './fixtures/tempo-response-edge-cases.js'

describe('parseTempoResponse', () => {
  describe('empty and invalid responses', () => {
    it('returns null for empty batches array', () => {
      const result = parseTempoResponse(emptyTempoResponse)
      expect(result).toBeNull()
    })

    it('returns null for batches with no spans', () => {
      const result = parseTempoResponse(emptyBatchesResponse)
      expect(result).toBeNull()
    })
  })

  describe('simple trace parsing', () => {
    it('parses a single span trace', () => {
      const result = parseTempoResponse(simpleTempoResponse)

      expect(result).not.toBeNull()
      expect(result!.traceId).toBe('abc123def456')
      expect(result!.serviceName).toBe('test-service')
      expect(result!.rootSpanName).toBe('GET /api/users')
      expect(result!.status).toBe('ok')
    })

    it('calculates duration correctly', () => {
      const result = parseTempoResponse(simpleTempoResponse)

      expect(result).not.toBeNull()
      // 100ms = 100,000,000 nanoseconds difference
      expect(result!.duration).toBe(100)
    })

    it('sets span type based on kind', () => {
      const result = parseTempoResponse(simpleTempoResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan).not.toBeNull()
      expect(result!.rootSpan!.spanType).toBe('http-server')
    })

    it('creates display name from HTTP attributes', () => {
      const result = parseTempoResponse(simpleTempoResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan!.displayName).toBe('GET /api/users')
    })
  })

  describe('nested trace parsing', () => {
    it('builds parent-child hierarchy', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan).not.toBeNull()
      expect(result!.rootSpan!.children).toHaveLength(1)

      const orchestrator = result!.rootSpan!.children[0]
      expect(orchestrator.name).toBe('chat.orchestrator')
      expect(orchestrator.children).toHaveLength(2)
    })

    it('calculates depths correctly', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan!.depth).toBe(0)

      const orchestrator = result!.rootSpan!.children[0]
      expect(orchestrator.depth).toBe(1)

      const agent = orchestrator.children.find((c) =>
        c.name.includes('router')
      )
      expect(agent!.depth).toBe(2)
    })

    it('detects orchestrator span type', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      const orchestrator = result!.rootSpan!.children[0]
      expect(orchestrator.spanType).toBe('orchestrator')
    })

    it('detects agent span type', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      const orchestrator = result!.rootSpan!.children[0]
      const agent = orchestrator.children.find((c) =>
        c.name.includes('router')
      )
      expect(agent!.spanType).toBe('agent')
    })

    it('detects tool span type', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      const orchestrator = result!.rootSpan!.children[0]
      const tool = orchestrator.children.find((c) =>
        c.name.includes('tool')
      )
      expect(tool!.spanType).toBe('tool')
    })

    it('extracts correlation ID from root span', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      expect(result!.rootSpan!.attributes['ai.correlation_id']).toBe(
        'conv_abc123'
      )
    })

    it('formats agent display name correctly', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      const orchestrator = result!.rootSpan!.children[0]
      const agent = orchestrator.children.find((c) =>
        c.name.includes('router')
      )
      expect(agent!.displayName).toBe('Router Agent')
    })
  })

  describe('error status handling', () => {
    it('parses error status correctly', () => {
      const result = parseTempoResponse(errorTempoResponse)

      expect(result).not.toBeNull()
      expect(result!.status).toBe('error')
      expect(result!.rootSpan!.status).toBe('error')
    })

    it('includes status message', () => {
      const result = parseTempoResponse(errorTempoResponse)

      expect(result!.rootSpan!.statusMessage).toBe('Something went wrong')
    })
  })

  describe('metrics calculation', () => {
    it('aggregates token counts', () => {
      const result = parseTempoResponse(metricsTempoResponse)

      expect(result).not.toBeNull()
      expect(result!.metrics.inputTokens).toBe(1500)
      expect(result!.metrics.outputTokens).toBe(500)
      expect(result!.metrics.totalTokens).toBe(2000)
      expect(result!.metrics.cachedTokens).toBe(1000)
    })

    it('aggregates cost', () => {
      const result = parseTempoResponse(metricsTempoResponse)

      expect(result!.metrics.costUsd).toBeCloseTo(0.0125, 4)
    })

    it('detects LLM span type', () => {
      const result = parseTempoResponse(metricsTempoResponse)

      const llmSpan = result!.spans.find((s) => s.name.includes('llm'))
      expect(llmSpan!.spanType).toBe('llm')
    })

    it('detects DB span type', () => {
      const result = parseTempoResponse(metricsTempoResponse)

      const dbSpan = result!.spans.find((s) => s.name.includes('db'))
      expect(dbSpan!.spanType).toBe('db')
    })
  })

  describe('operation counting', () => {
    it('counts agents correctly', () => {
      const result = parseTempoResponse(operationsTempoResponse)

      expect(result!.metrics.agentCount).toBe(2)
    })

    it('counts tools correctly', () => {
      const result = parseTempoResponse(operationsTempoResponse)

      expect(result!.metrics.toolCount).toBe(3)
    })

    it('counts db operations correctly', () => {
      const result = parseTempoResponse(operationsTempoResponse)

      expect(result!.metrics.dbOperations).toBe(1)
    })
  })

  describe('all spans collection', () => {
    it('includes all spans in flat array', () => {
      const result = parseTempoResponse(nestedTempoResponse)

      expect(result!.spans).toHaveLength(4)
    })

    it('includes all spans in operations trace', () => {
      const result = parseTempoResponse(operationsTempoResponse)

      // root + 2 agents + 3 tools + 1 db = 7
      expect(result!.spans).toHaveLength(7)
    })
  })

  describe('attribute value parsing edge cases', () => {
    it('parses boolean attributes correctly', () => {
      const result = parseTempoResponse(booleanAttributeResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan!.attributes['feature.enabled']).toBe(true)
      expect(result!.rootSpan!.attributes['cache.hit']).toBe(false)
    })

    it('parses double attributes correctly', () => {
      const result = parseTempoResponse(booleanAttributeResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan!.attributes['request.count']).toBeCloseTo(3.14159, 5)
    })
  })

  describe('span type detection edge cases', () => {
    it('detects http-client for CLIENT spans without db.system', () => {
      const result = parseTempoResponse(httpClientResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan!.spanType).toBe('http-client')
    })

    it('detects lifecycle spans by name pattern', () => {
      const result = parseTempoResponse(lifecycleSpanResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan!.spanType).toBe('lifecycle')
    })

    it('detects db span by name pattern (db.)', () => {
      const result = parseTempoResponse(dbNamePatternResponse)

      expect(result).not.toBeNull()
      expect(result!.rootSpan!.spanType).toBe('db')
    })

    it('falls back to internal for unknown span patterns', () => {
      const result = parseTempoResponse(booleanAttributeResponse)

      expect(result).not.toBeNull()
      // test.operation doesn't match any specific pattern
      expect(result!.rootSpan!.spanType).toBe('internal')
    })
  })

  describe('status code parsing edge cases', () => {
    it('returns unset for unknown numeric status codes', () => {
      const result = parseTempoResponse(unknownStatusCodeResponse)

      expect(result).not.toBeNull()
      expect(result!.status).toBe('unset')
      expect(result!.rootSpan!.status).toBe('unset')
    })

    it('returns unset for unknown string status codes', () => {
      const result = parseTempoResponse(stringStatusCodeResponse)

      expect(result).not.toBeNull()
      expect(result!.status).toBe('unset')
      expect(result!.rootSpan!.status).toBe('unset')
    })
  })
})
