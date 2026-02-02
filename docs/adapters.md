# Custom Adapters

Guide to implementing custom adapters for Agent QA.

## Overview

Agent QA uses adapters to interact with external systems:

| Adapter | Purpose | Built-in Implementation |
|---------|---------|------------------------|
| `DatabaseAdapter` | Entity queries | Drizzle ORM |
| `AgentAdapter` | AI agent communication | HTTP client |
| `VectorStoreAdapter` | Vector store queries | Milvus |
| `TracesProvider` | Trace collection | Grafana Tempo |

## DatabaseAdapter Interface

```typescript
interface DatabaseAdapter {
  /** Find an entity by ID */
  findById(entity: string, id: string): Promise<QueryResult>;

  /** Find an entity by title */
  findByTitle(entity: string, title: string): Promise<QueryResult>;

  /** List entities with optional filters */
  list(entity: string, filters?: Record<string, unknown>): Promise<EntityRow[]>;

  /** Insert a new entity */
  insert(entity: string, data: Record<string, unknown>): Promise<{ id: string }>;

  /** Update an entity by ID (optional) */
  update?(entity: string, id: string, data: Record<string, unknown>): Promise<void>;

  /** Delete an entity by ID (optional) */
  delete?(entity: string, id: string): Promise<void>;

  /** Get all entity schemas */
  getSchemas(): EntitySchema[];

  /** Get schema for a specific entity */
  getSchema(entity: string): EntitySchema | undefined;

  /** Optional cleanup on shutdown */
  cleanup?(): Promise<void>;
}
```

## Supporting Types

```typescript
interface QueryResult {
  entity: EntityRow | null;
  found: boolean;
}

type EntityRow = Record<string, unknown>;

interface EntitySchema {
  name: string;
  tableName: string;
  titleColumn?: string;
  userIdColumn?: string | null;
  columns: string[];
}
```

## Example: In-Memory Adapter

```typescript
// my-adapter.ts
import type { DatabaseAdapter, EntityRow, QueryResult, EntitySchema } from '@agent-qa/core';

export function createInMemoryAdapter(): DatabaseAdapter {
  const stores: Map<string, EntityRow[]> = new Map();
  const schemas: EntitySchema[] = [
    { name: 'tasks', tableName: 'tasks', titleColumn: 'title', columns: ['id', 'title', 'status'] },
  ];

  return {
    async findById(entity: string, id: string): Promise<QueryResult> {
      const store = stores.get(entity) ?? [];
      const found = store.find(row => row.id === id);
      return { entity: found ?? null, found: !!found };
    },

    async findByTitle(entity: string, title: string): Promise<QueryResult> {
      const store = stores.get(entity) ?? [];
      const schema = schemas.find(s => s.name === entity);
      const titleCol = schema?.titleColumn ?? 'title';
      const found = store.find(row => row[titleCol] === title);
      return { entity: found ?? null, found: !!found };
    },

    async list(entity: string, filters?: Record<string, unknown>): Promise<EntityRow[]> {
      let store = stores.get(entity) ?? [];
      if (filters) {
        store = store.filter(row =>
          Object.entries(filters).every(([key, value]) => row[key] === value)
        );
      }
      return store;
    },

    async insert(entity: string, data: Record<string, unknown>): Promise<{ id: string }> {
      const id = crypto.randomUUID();
      const row = { id, ...data };
      const store = stores.get(entity) ?? [];
      store.push(row);
      stores.set(entity, store);
      return { id };
    },

    async update(entity: string, id: string, data: Record<string, unknown>): Promise<void> {
      const store = stores.get(entity) ?? [];
      const index = store.findIndex(row => row.id === id);
      if (index !== -1) {
        store[index] = { ...store[index], ...data };
      }
    },

    async delete(entity: string, id: string): Promise<void> {
      const store = stores.get(entity) ?? [];
      const index = store.findIndex(row => row.id === id);
      if (index !== -1) {
        store.splice(index, 1);
      }
    },

    getSchemas(): EntitySchema[] {
      return schemas;
    },

    getSchema(entity: string): EntitySchema | undefined {
      return schemas.find(s => s.name === entity);
    },

    async cleanup(): Promise<void> {
      stores.clear();
    },
  };
}
```

## Using Custom Adapter in Config

```typescript
// agentqa.config.ts
import { defineConfig } from '@agent-qa/core';
import { createInMemoryAdapter } from './my-adapter';

export default defineConfig({
  name: 'MyApp',

  agent: {
    baseUrl: '$API_URL',
    token: '$API_TOKEN',
  },

  database: {
    adapter: createInMemoryAdapter(),
  },
});
```

## Programmatic Usage

For more control, use the TestRunner directly:

```typescript
import { createTestRunner, createHttpAgentFromConfig } from '@agent-qa/core';
import { createInMemoryAdapter } from './my-adapter';

const runner = createTestRunner(config, {
  agent: createHttpAgentFromConfig(config.agent),
  database: createInMemoryAdapter(),
});

const result = await runner.runSuite('suite.yaml');
```

## AgentAdapter Interface

You can also implement a custom agent adapter:

```typescript
interface AgentAdapter {
  chat(options: ChatOptions): Promise<AgentResponse>;
  cleanup?(): Promise<void>;
}

interface ChatOptions {
  message: string;
  userId: string;
  conversationId?: string;
  maxToolCalls?: number;
  timeout?: number;
}

interface AgentResponse {
  text: string;
  toolCalls: ToolCall[];
  conversationId: string;
  correlationId?: string;
  usage?: TokenUsage;
  detailedUsage?: DetailedUsage;
}
```

## VectorStoreAdapter Interface

For vector store assertions:

```typescript
interface VectorStoreAdapter {
  search(collection: string, query: VectorSearchQuery): Promise<VectorSearchResult[]>;
  listCollections(): Promise<string[]>;
  getCollection(name: string): Promise<CollectionSchema | null>;
  cleanup?(): Promise<void>;
}
```

See the built-in Milvus adapter for a reference implementation.

## TracesProvider Interface

For custom tracing backends (LangFuse, Jaeger, Datadog, etc.):

```typescript
import type { TracesProvider, ParsedTrace, TraceSearchOptions } from '@agent-qa/core/traces';

interface TracesProvider {
  /** Provider name for display */
  readonly name: string;

  /** Check if the backend is reachable */
  isReachable(): Promise<boolean>;

  /** Get trace by correlation ID */
  getTraceByCorrelationId(correlationId: string): Promise<ParsedTrace | null>;

  /** Search traces (optional) */
  searchTraces?(options: TraceSearchOptions): Promise<TraceSearchResult[]>;

  /** Get detailed status (optional) */
  getStatus?(): Promise<TracesProviderStatus>;

  /** Cleanup resources (optional) */
  cleanup?(): Promise<void>;
}
```

### Trace Types

```typescript
interface ParsedTrace {
  traceId: string;
  serviceName: string;
  rootSpanName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: SpanStatus;
  spans: ParsedSpan[];
  rootSpan: ParsedSpan | null;
  metrics: TraceMetrics;
}

interface ParsedSpan {
  id: string;
  parentId: string | null;
  traceId: string;
  name: string;
  displayName: string;
  spanType: SpanType;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: SpanStatus;
  statusMessage: string;
  attributes: Record<string, string | number | boolean>;
  children: ParsedSpan[];
  depth: number;
}

interface TraceMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  agentCount: number;
  toolCount: number;
  dbOperations: number;
  llmCalls: number;
}
```

### Example: Custom Traces Provider

```typescript
import type { TracesProvider, ParsedTrace } from '@agent-qa/core/traces';

export function createLangfuseProvider(config: LangfuseConfig): TracesProvider {
  return {
    name: 'langfuse',

    async isReachable(): Promise<boolean> {
      try {
        const response = await fetch(`${config.url}/health`);
        return response.ok;
      } catch {
        return false;
      }
    },

    async getTraceByCorrelationId(correlationId: string): Promise<ParsedTrace | null> {
      // Fetch trace from LangFuse
      const response = await fetch(`${config.url}/api/traces?sessionId=${correlationId}`);
      const data = await response.json();

      if (!data.traces?.length) {
        return null;
      }

      // Convert to ParsedTrace format
      return convertLangfuseTrace(data.traces[0]);
    },

    async searchTraces(options): Promise<TraceSearchResult[]> {
      // Implement search logic
      const response = await fetch(`${config.url}/api/traces?limit=${options.limit}`);
      const data = await response.json();
      return data.traces.map(convertToSearchResult);
    },
  };
}

// Helper to convert LangFuse trace to ParsedTrace
function convertLangfuseTrace(trace: LangfuseTrace): ParsedTrace {
  return {
    traceId: trace.id,
    serviceName: trace.name ?? 'unknown',
    rootSpanName: trace.name ?? 'root',
    startTime: new Date(trace.timestamp),
    endTime: new Date(trace.timestamp + trace.duration),
    duration: trace.duration,
    status: trace.status === 'error' ? 'error' : 'ok',
    spans: trace.observations.map(convertToSpan),
    rootSpan: null, // Build tree from spans
    metrics: calculateMetrics(trace),
  };
}
```

### Using Custom Traces Provider

```typescript
// agentqa.config.ts
import { defineConfig } from '@agent-qa/core';
import { createLangfuseProvider } from './langfuse-provider';

export default defineConfig({
  name: 'MyApp',
  agent: { /* ... */ },
  diagnostics: {
    traces: {
      provider: createLangfuseProvider({
        url: 'https://langfuse.example.com',
        apiKey: process.env.LANGFUSE_API_KEY,
      }),
    },
  },
});
```

See `@agent-qa/traces-tempo` for a complete reference implementation.
