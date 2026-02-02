# @agent-qa/traces-tempo

Grafana Tempo traces provider for the agent-qa framework.

## Installation

```bash
npm install @agent-qa/traces-tempo
# or
pnpm add @agent-qa/traces-tempo
```

## Features

- Implements the `TracesProvider` interface from `@agent-qa/core`
- Fetch traces by ID or correlation ID
- Search traces with filters (service, tags, time range)
- Parse Tempo API responses into typed structures
- Health check and status utilities

## Usage with Agent-QA

The recommended way to use this package is with the agent-qa diagnostics config:

```typescript
// agentqa.config.ts
import { defineConfig } from '@agent-qa/core';
import { createTempoProvider } from '@agent-qa/traces-tempo';

export default defineConfig({
  name: 'MyApp',
  agent: { /* ... */ },
  diagnostics: {
    traces: {
      provider: createTempoProvider({
        url: 'http://localhost:3200',
      }),
    },
  },
});
```

## Standalone Usage

You can also use the provider directly:

```typescript
import { createTempoProvider } from '@agent-qa/traces-tempo';

const provider = createTempoProvider({
  url: 'http://localhost:3200',
});

// Check if Tempo is reachable
const reachable = await provider.isReachable();

// Get trace by correlation ID
const trace = await provider.getTraceByCorrelationId('conv_abc123');

// Search traces
const results = await provider.searchTraces({
  service: 'my-api',
  limit: 20,
});
```

## Low-Level API

For advanced use cases, you can use the low-level client functions directly:

### Fetch a Trace

```typescript
import { fetchTrace, parseTempoResponse } from '@agent-qa/traces-tempo';

const response = await fetchTrace('trace-id-here');
const trace = parseTempoResponse(response);
```

### Search Traces

```typescript
import { searchTraces, parseTimeRange } from '@agent-qa/traces-tempo';

const now = Math.floor(Date.now() / 1000);
const results = await searchTraces({
  service: 'my-api',
  start: now - parseTimeRange('1h'),
  end: now,
  limit: 20,
});
```

### Search by Correlation ID

```typescript
import { searchByCorrelationId } from '@agent-qa/traces-tempo';

// Find all traces for a specific conversation/session
const traces = await searchByCorrelationId('conv_abc123', {
  limit: 10,
  since: 3600, // seconds
});
```

### Check Tempo Status

```typescript
import { isTempoReachable, getStatus } from '@agent-qa/traces-tempo';

if (await isTempoReachable()) {
  const status = await getStatus();
  console.log('Tempo is healthy:', status);
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TEMPO_URL` | Tempo API endpoint (default: `http://localhost:3200`) |
| `TEMPO_TIMEOUT` | Request timeout in ms (default: `30000`) |

## API Reference

### Provider Factory

```typescript
import { createTempoProvider, type TempoProviderConfig } from '@agent-qa/traces-tempo';

const provider = createTempoProvider({
  url?: string;      // Tempo server URL
  timeout?: number;  // Request timeout
});
```

### Client Functions

```typescript
import {
  fetchTrace,
  fetchTraces,
  searchTraces,
  searchByCorrelationId,
  getTraceByCorrelationId,
  isTempoReachable,
  getStatus,
  getConfig,
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
  // Provider types (from @agent-qa/core)
  TracesProvider,
  TracesProviderStatus,
  TraceSearchOptions,

  // Domain types (from @agent-qa/core)
  ParsedTrace,
  ParsedSpan,
  TraceMetrics,
  TraceSearchResult,
  SpanType,
  SpanStatus,

  // Tempo-specific types
  TempoProviderConfig,
  TempoConfig,
  SearchOptions,
  TempoResponse,
  TempoSearchResult,
} from '@agent-qa/traces-tempo';
```

## Custom Providers

This package provides a Tempo implementation of the `TracesProvider` interface.
You can create your own providers for other backends (LangFuse, Jaeger, etc.):

```typescript
import type { TracesProvider, ParsedTrace } from '@agent-qa/core/traces';

const myProvider: TracesProvider = {
  name: 'my-backend',

  async isReachable() {
    // Check if your backend is reachable
    return true;
  },

  async getTraceByCorrelationId(correlationId) {
    // Fetch and convert trace to ParsedTrace format
    return convertToParsedTrace(await fetchFromMyBackend(correlationId));
  },

  async searchTraces(options) {
    // Search your backend
    return convertToSearchResults(await searchMyBackend(options));
  },
};
```

## License

MIT
