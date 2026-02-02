import type { TempoResponse } from '../../types/tempo.js'

/**
 * Trace with token and cost metrics
 */
export const metricsTempoResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'ai-service' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'ai-sdk', version: '1.0.0' },
          spans: [
            {
              traceId: 'metrics-trace',
              spanId: 'root001',
              name: 'chat-completion',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000002000000000',
              attributes: [],
              status: { code: 1 },
            },
            {
              traceId: 'metrics-trace',
              spanId: 'llm001',
              parentSpanId: 'root001',
              name: 'llm.anthropic',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000100000000',
              endTimeUnixNano: '1700000001500000000',
              attributes: [
                { key: 'gen_ai.system', value: { stringValue: 'anthropic' } },
                { key: 'gen_ai.usage.input_tokens', value: { intValue: 1500 } },
                { key: 'gen_ai.usage.output_tokens', value: { intValue: 500 } },
                { key: 'gen_ai.usage.cache_read_tokens', value: { intValue: 1000 } },
                { key: 'ai.cost.total_usd', value: { doubleValue: 0.0125 } },
              ],
              status: { code: 1 },
            },
            {
              traceId: 'metrics-trace',
              spanId: 'db001',
              parentSpanId: 'root001',
              name: 'db.query',
              kind: 'SPAN_KIND_CLIENT',
              startTimeUnixNano: '1700000001500000000',
              endTimeUnixNano: '1700000001800000000',
              attributes: [
                { key: 'db.system', value: { stringValue: 'postgresql' } },
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
 * Trace with multiple agents and tools for operation counting
 */
export const operationsTempoResponse: TempoResponse = {
  batches: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'multi-agent' } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: 'agents', version: '1.0.0' },
          spans: [
            {
              traceId: 'ops-trace',
              spanId: 'root001',
              name: 'orchestrator',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000000000000',
              endTimeUnixNano: '1700000003000000000',
              attributes: [],
              status: { code: 1 },
            },
            // 2 agents
            {
              traceId: 'ops-trace',
              spanId: 'agent001',
              parentSpanId: 'root001',
              name: 'ai.agent.router',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000000100000000',
              endTimeUnixNano: '1700000001000000000',
              attributes: [],
              status: { code: 1 },
            },
            {
              traceId: 'ops-trace',
              spanId: 'agent002',
              parentSpanId: 'root001',
              name: 'ai.agent.task-agent',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000001000000000',
              endTimeUnixNano: '1700000002000000000',
              attributes: [],
              status: { code: 1 },
            },
            // 3 tools
            {
              traceId: 'ops-trace',
              spanId: 'tool001',
              parentSpanId: 'agent002',
              name: 'ai.tool.list-tasks',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000001100000000',
              endTimeUnixNano: '1700000001300000000',
              attributes: [],
              status: { code: 1 },
            },
            {
              traceId: 'ops-trace',
              spanId: 'tool002',
              parentSpanId: 'agent002',
              name: 'ai.tool.create-task',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000001300000000',
              endTimeUnixNano: '1700000001600000000',
              attributes: [],
              status: { code: 1 },
            },
            {
              traceId: 'ops-trace',
              spanId: 'tool003',
              parentSpanId: 'agent002',
              name: 'tool.update-task',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1700000001600000000',
              endTimeUnixNano: '1700000001900000000',
              attributes: [],
              status: { code: 1 },
            },
            // 1 db operation
            {
              traceId: 'ops-trace',
              spanId: 'db001',
              parentSpanId: 'tool002',
              name: 'db.insert',
              kind: 'SPAN_KIND_CLIENT',
              startTimeUnixNano: '1700000001400000000',
              endTimeUnixNano: '1700000001500000000',
              attributes: [
                { key: 'db.system', value: { stringValue: 'postgresql' } },
              ],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
}
