# CLAUDE.md - @agent-qa/traces-tempo

Grafana Tempo traces provider for Agent QA. Implements the `TracesProvider` interface.

## Package Structure

```
packages/traces-tempo/
├── src/
│   ├── client.ts           # Low-level Tempo HTTP client
│   ├── parser.ts           # Parse Tempo responses to ParsedTrace
│   ├── provider.ts         # TracesProvider implementation
│   ├── index.ts            # Package exports
│   └── types/
│       ├── tempo.ts        # Tempo API response types
│       ├── trace.ts        # Re-exports from @agent-qa/core/traces
│       └── index.ts        # Type exports
└── __tests__/              # Test files
```

## Commands

```bash
# Build
pnpm build

# Test
pnpm test
pnpm test:watch

# Type check
pnpm type-check

# Lint
pnpm lint
```

## Key Exports

### Primary Export (TracesProvider)

```typescript
import { createTempoProvider } from '@agent-qa/traces-tempo';

const provider = createTempoProvider({
  url: 'http://localhost:3200',
  timeout: 30000,
});

// Use with agent-qa diagnostics
diagnostics: {
  traces: { provider }
}
```

### Low-Level Client Functions

```typescript
import {
  fetchTrace,
  fetchTraces,
  searchTraces,
  searchByCorrelationId,
  getTraceByCorrelationId,
  isTempoReachable,
  getStatus,
  parseTimeRange,
} from '@agent-qa/traces-tempo';
```

### Parser

```typescript
import { parseTempoResponse } from '@agent-qa/traces-tempo';
```

### Types

```typescript
import type {
  // Provider types
  TracesProvider,
  TracesProviderStatus,
  TraceSearchOptions,
  TempoProviderConfig,

  // Domain types (from core)
  ParsedTrace,
  ParsedSpan,
  TraceMetrics,
  SpanType,
  SpanStatus,

  // Tempo-specific types
  TempoResponse,
  TempoSearchResult,
  Batch,
  Span,
} from '@agent-qa/traces-tempo';
```

## TracesProvider Implementation

This package provides the Tempo implementation of the `TracesProvider` interface:

```typescript
interface TracesProvider {
  readonly name: string;  // 'tempo'
  isReachable(): Promise<boolean>;
  getTraceByCorrelationId(correlationId: string): Promise<ParsedTrace | null>;
  searchTraces?(options: TraceSearchOptions): Promise<TraceSearchResult[]>;
  getStatus?(): Promise<TracesProviderStatus>;
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPO_URL` | Tempo API endpoint | `http://localhost:3200` |
| `TEMPO_TIMEOUT` | Request timeout in ms | `30000` |

## Dependencies

- **Required**: `@agent-qa/core` (for TracesProvider types)

## Architecture

```
@agent-qa/core/traces          @agent-qa/traces-tempo
┌─────────────────────┐        ┌─────────────────────┐
│  TracesProvider     │◄───────│  createTempoProvider│
│  ParsedTrace        │        │                     │
│  ParsedSpan         │        │  client.ts          │
│  TraceMetrics       │        │  parser.ts          │
└─────────────────────┘        └─────────────────────┘
       (interface)                (implementation)
```

The domain types (`ParsedTrace`, `ParsedSpan`, etc.) are defined in `@agent-qa/core/traces` and are backend-agnostic. This package provides the Tempo-specific implementation.

## Creating Custom Providers

To create a provider for another backend (LangFuse, Jaeger, etc.):

```typescript
import type { TracesProvider, ParsedTrace } from '@agent-qa/core/traces';

export function createMyProvider(config: MyConfig): TracesProvider {
  return {
    name: 'my-backend',

    async isReachable() {
      // Check if backend is reachable
    },

    async getTraceByCorrelationId(correlationId) {
      // Fetch trace and convert to ParsedTrace format
    },

    async searchTraces(options) {
      // Search traces and return results
    },
  };
}
```

## Testing

```bash
# Run all tests
pnpm test

# Run with watch mode
pnpm test:watch
```

Tests use mocked HTTP responses to avoid requiring a live Tempo instance.
