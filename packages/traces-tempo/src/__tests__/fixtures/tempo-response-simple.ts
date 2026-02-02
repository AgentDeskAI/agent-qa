import type { TempoResponse } from '../../types/tempo.js'

/**
 * Simple trace with a single HTTP request span
 */
export const simpleTempoResponse: TempoResponse = {
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
              traceId: 'abc123def456',
              spanId: 'span001',
              name: 'GET /api/users',
              kind: 'SPAN_KIND_SERVER',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000100000000',
              attributes: [
                { key: 'http.method', value: { stringValue: 'GET' } },
                { key: 'url.path', value: { stringValue: '/api/users' } },
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
 * Empty response with no spans
 */
export const emptyTempoResponse: TempoResponse = {
  batches: [],
}

/**
 * Response with empty batches
 */
export const emptyBatchesResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'empty-service' } },
        ],
      },
      scopeSpans: [],
    },
  ],
}
