import type { TempoResponse } from '../../types/tempo.js'

/**
 * Nested trace with parent-child span hierarchy
 * Structure:
 *   root-span (HTTP server)
 *     └── orchestrator (chat.orchestrator)
 *           ├── agent (ai.agent.router)
 *           └── tool (ai.tool.create-task)
 */
export const nestedTempoResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'pocketcoach-api' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'opentelemetry', version: '1.0.0' },
          spans: [
            {
              traceId: 'trace123',
              spanId: 'root001',
              name: 'POST /api/chat',
              kind: 'SPAN_KIND_SERVER',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000001000000000',
              attributes: [
                { key: 'http.method', value: { stringValue: 'POST' } },
                { key: 'url.path', value: { stringValue: '/api/chat' } },
                { key: 'ai.correlation_id', value: { stringValue: 'conv_abc123' } },
              ],
              status: { code: 1 },
            },
            {
              traceId: 'trace123',
              spanId: 'orch001',
              parentSpanId: 'root001',
              name: 'chat.orchestrator',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000100000000',
              endTimeUnixNano: '1700000000900000000',
              attributes: [],
              status: { code: 1 },
            },
            {
              traceId: 'trace123',
              spanId: 'agent001',
              parentSpanId: 'orch001',
              name: 'ai.agent.router-agent',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000200000000',
              endTimeUnixNano: '1700000000500000000',
              attributes: [
                { key: 'ai.agent_id', value: { stringValue: 'router' } },
              ],
              status: { code: 1 },
            },
            {
              traceId: 'trace123',
              spanId: 'tool001',
              parentSpanId: 'orch001',
              name: 'ai.tool.create-task',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000500000000',
              endTimeUnixNano: '1700000000800000000',
              attributes: [],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}

/**
 * Trace with error status
 */
export const errorTempoResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'error-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'test', version: '1.0.0' },
          spans: [
            {
              traceId: 'error-trace',
              spanId: 'error-span',
              name: 'failing-operation',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000000050000000',
              attributes: [],
              status: { code: 2, message: 'Something went wrong' },
            },
          ],
        },
      ],
    },
  ],
}
