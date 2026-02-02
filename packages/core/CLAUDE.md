# CLAUDE.md - @agent-qa/core

Main framework package for Agent QA. Provides CLI, test runner, assertions, and adapters.

## Package Structure

```
packages/core/
├── src/
│   ├── adapters/           # Database, agent, vector store adapters
│   ├── assertions/         # Tool, entity, response, relationship assertions
│   ├── cli/                # CLI commands (run, chat, db, etc.)
│   ├── config/             # Configuration loading and resolution
│   ├── diagnostics/        # Failure diagnostics (tmux, traces, logs)
│   ├── helpers/            # Helper utilities (health checks, processes)
│   ├── lifecycle/          # Global setup, preflight checks
│   ├── reporters/          # Console, markdown reporters
│   ├── runner/             # Test runner and step executors
│   ├── scenario/           # YAML parsing and scenario types
│   ├── traces/             # TracesProvider interface and types
│   ├── tracking/           # Token usage tracking
│   └── utils/              # Shared utilities
├── bin/
│   └── agent-qa.ts         # CLI entry point
└── __tests__/              # Test files
```

## Commands

```bash
# Build
pnpm build

# Test
pnpm test
pnpm test:watch
pnpm test:coverage

# Type check
pnpm type-check

# Lint
pnpm lint
pnpm lint:fix
```

## Key Exports

### Configuration
```typescript
import { defineConfig, loadConfig, resolveConfig } from '@agent-qa/core';
```

### Assertions
```typescript
import {
  assertToolCalls,
  verifyEntity,
  assertResponse,
  waitFor,
} from '@agent-qa/core';
```

### Adapters
```typescript
import {
  createHttpAgent,
  createDrizzleAdapter,
} from '@agent-qa/core';
```

### Runner
```typescript
import {
  TestRunner,
  createTestRunner,
  ExecutionContext,
} from '@agent-qa/core';
```

### Diagnostics
```typescript
import {
  createTmuxLogProvider,
  createTracesDiagnosticsProvider,
  createTempoTraceProvider,  // Legacy, use traces-tempo instead
} from '@agent-qa/core';
```

### Traces (TracesProvider Interface)
```typescript
import type {
  TracesProvider,
  ParsedTrace,
  ParsedSpan,
  TraceMetrics,
} from '@agent-qa/core/traces';
```

## TracesProvider Interface

The `TracesProvider` interface allows pluggable tracing backends:

```typescript
interface TracesProvider {
  readonly name: string;
  isReachable(): Promise<boolean>;
  getTraceByCorrelationId(correlationId: string): Promise<ParsedTrace | null>;
  searchTraces?(options: TraceSearchOptions): Promise<TraceSearchResult[]>;
  getStatus?(): Promise<TracesProviderStatus>;
}
```

Domain types (`ParsedTrace`, `ParsedSpan`, etc.) are backend-agnostic and defined in `src/traces/types.ts`.

## Diagnostics Configuration

```typescript
// New format (recommended)
import { createTempoProvider } from '@agent-qa/traces-tempo';

diagnostics: {
  traces: {
    provider: createTempoProvider({ url: 'http://localhost:3200' })
  }
}

// Legacy format (still supported)
diagnostics: {
  tempo: { url: 'http://localhost:3200' }
}
```

## Dependencies

- **Required**: `@agent-qa/cost-registry`
- **Optional**: `@agent-qa/traces-tempo` (for trace diagnostics)
- **Peer (optional)**: `drizzle-orm`, `postgres`, `@zilliz/milvus2-sdk-node`

## Testing

Test files are in `src/__tests__/` organized by module:

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test src/__tests__/diagnostics/tempo-traces.test.ts

# Run tests matching pattern
pnpm test -- --grep "TracesProvider"
```

## Adding New Features

1. Add implementation in appropriate `src/` directory
2. Export from the module's `index.ts`
3. Re-export from `src/index.ts` if public API
4. Add tests in `src/__tests__/`
5. Update this CLAUDE.md if significant
