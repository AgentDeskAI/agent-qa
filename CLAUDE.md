# CLAUDE.md - Agent QA

Framework-based AI agent testing with convention over configuration.

## Repository Structure

```
agent-qa/
├── packages/
│   ├── core/                  # @agent-qa/core - Main framework
│   ├── cost-registry/         # @agent-qa/cost-registry - LLM pricing
│   └── traces-tempo/          # @agent-qa/traces-tempo - Tempo traces provider
├── examples/
│   └── demo-agent/            # Working example
├── docs/                      # Documentation
└── .github/workflows/         # CI/CD
```

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm type-check

# Lint
pnpm lint
```

## Package Dependencies

```
@agent-qa/core
├── @agent-qa/cost-registry (required)
└── @agent-qa/traces-tempo (optional)
```

## Key Patterns

### Configuration
- Config files: `agentqa.config.ts`
- Environment variables: `$VAR` syntax resolved at load time
- Type-safe config via `defineConfig()`

### Adapters
- `AgentAdapter`: HTTP communication with AI agent
- `DatabaseAdapter`: Entity queries (Drizzle built-in, custom supported)
- `VectorStoreAdapter`: Vector store queries (Milvus built-in)
- `TracesProvider`: Trace collection for diagnostics (Tempo built-in, custom supported)

### TracesProvider Pattern

The traces system uses an adapter pattern allowing pluggable backends:

```typescript
// Use built-in Tempo provider
import { createTempoProvider } from '@agent-qa/traces-tempo';

diagnostics: {
  traces: {
    provider: createTempoProvider({ url: 'http://localhost:3200' })
  }
}

// Or implement your own
const myProvider: TracesProvider = {
  name: 'langfuse',
  async isReachable() { /* ... */ },
  async getTraceByCorrelationId(id) { /* ... */ },
};
```

Core types are in `@agent-qa/core/traces`:
- `TracesProvider` - Interface for any tracing backend
- `ParsedTrace`, `ParsedSpan` - Backend-agnostic trace types
- `TraceMetrics` - Token/cost metrics from traces

### YAML Scenarios
- Suite: `scenarios/suite.yaml`
- Steps: chat, verify, wait, setup
- Assertions: tools, response, created, usage

### Lifecycle
- `globalSetup`: Start infrastructure before tests
- `hooks.beforeEach/afterEach`: Per-scenario setup/teardown

## Test Files

```bash
# Run specific package tests
pnpm --filter @agent-qa/core test
pnpm --filter @agent-qa/cost-registry test
pnpm --filter @agent-qa/traces-tempo test

# Run with coverage
pnpm --filter @agent-qa/core test:coverage
```

## Adding Features

1. Add implementation in appropriate package
2. Export from package index.ts
3. Add tests in `src/__tests__/`
4. Update documentation in `docs/`
5. Add/update CLAUDE.md in the package

## Publishing

```bash
# Build all packages
pnpm build

# Publish (handled by CI on release)
pnpm -r publish
```
