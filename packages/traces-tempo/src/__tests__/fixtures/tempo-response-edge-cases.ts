import type { TempoResponse } from '../../types/tempo.js'

/**
 * Span with boolean attribute to test boolValue parsing
 */
export const booleanAttributeResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'test-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'test-scope', version: '1.0.0' },
          spans: [
            {
              traceId: 'bool-trace-001',
              spanId: 'bool-span-001',
              name: 'test.operation',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000100000000',
              attributes: [
                { key: 'feature.enabled', value: { boolValue: true } },
                { key: 'cache.hit', value: { boolValue: false } },
                { key: 'request.count', value: { doubleValue: 3.14159 } },
              ],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}

/**
 * HTTP client span (SPAN_KIND_CLIENT without db.system)
 */
export const httpClientResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'api-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'http-client', version: '1.0.0' },
          spans: [
            {
              traceId: 'http-client-trace-001',
              spanId: 'http-client-span-001',
              name: 'HTTP GET',
              kind: 'SPAN_KIND_CLIENT',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000200000000',
              attributes: [
                { key: 'http.method', value: { stringValue: 'GET' } },
                { key: 'http.url', value: { stringValue: 'https://api.example.com/users' } },
                { key: 'http.status_code', value: { intValue: 200 } },
              ],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}

/**
 * Lifecycle span to test lifecycle type detection
 */
export const lifecycleSpanResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'agent-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'lifecycle', version: '1.0.0' },
          spans: [
            {
              traceId: 'lifecycle-trace-001',
              spanId: 'lifecycle-span-001',
              name: 'ai.lifecycle.initialize',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000050000000',
              attributes: [
                { key: 'ai.agent_name', value: { stringValue: 'router' } },
              ],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}

/**
 * Span with unknown status code to test fallback handling
 */
export const unknownStatusCodeResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'test-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'test-scope', version: '1.0.0' },
          spans: [
            {
              traceId: 'unknown-status-trace-001',
              spanId: 'unknown-status-span-001',
              name: 'test.unknown.status',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000100000000',
              attributes: [],
              status: { code: 99 }, // Unknown status code
            },
          ],
        },
      ],
    },
  ],
}

/**
 * Span with string-based status code
 */
export const stringStatusCodeResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'test-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'test-scope', version: '1.0.0' },
          spans: [
            {
              traceId: 'string-status-trace-001',
              spanId: 'string-status-span-001',
              name: 'test.string.status',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000100000000',
              attributes: [],
              status: { code: 'STATUS_CODE_UNKNOWN' as unknown as number }, // Unknown string status
            },
          ],
        },
      ],
    },
  ],
}

/**
 * DB span detected by name pattern (db.query)
 */
export const dbNamePatternResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'db-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'db-scope', version: '1.0.0' },
          spans: [
            {
              traceId: 'db-pattern-trace-001',
              spanId: 'db-pattern-span-001',
              name: 'db.query.select',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000100000000',
              attributes: [],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}
