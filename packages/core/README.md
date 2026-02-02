# @agent-qa/core

Main package for the Agent QA testing framework.

## Installation

```bash
npm install @agent-qa/core
# or
pnpm add @agent-qa/core
```

## Features

- **CLI**: Run tests, chat with agents, inspect databases
- **YAML Scenarios**: Define tests in readable YAML format
- **Assertions**: Tool calls, entity state, responses, usage
- **Adapters**: Drizzle ORM, custom adapters, vector stores
- **Lifecycle**: Global setup, per-scenario hooks
- **Diagnostics**: Tmux logs, Tempo traces, failure debugging

## Quick Start

```typescript
// agentqa.config.ts
import { defineConfig } from '@agent-qa/core';

export default defineConfig({
  name: 'MyApp',
  agent: {
    baseUrl: '$API_URL',
    token: '$API_TOKEN',
  },
});
```

```yaml
# scenarios/suite.yaml
name: My Tests
scenarios:
  - id: test-001
    steps:
      - chat: "Hello"
        response:
          contains: ["hi", "hello"]
```

```bash
npx agentqa run scenarios/suite.yaml
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `agentqa run <suite>` | Run test scenarios |
| `agentqa chat` | Chat with agent interactively |
| `agentqa db <entity>` | Inspect database entities |
| `agentqa setup` | Start infrastructure |
| `agentqa teardown` | Stop infrastructure |
| `agentqa tokens` | Count tokens in text |
| `agentqa schema-tokens` | Analyze Zod schema tokens |
| `agentqa analyze-tokens` | Analyze diagnostics tokens |

## Exports

### Main

```typescript
import {
  // Config
  defineConfig,
  loadConfig,

  // Runner
  createTestRunner,
  TestRunner,

  // Adapters
  createHttpAgent,
  createDrizzleAdapter,
  createMilvusAdapter,

  // Lifecycle
  runGlobalSetup,
  runTeardown,
} from '@agent-qa/core';
```

### Helpers

```typescript
import {
  dockerPostgres,
  tmuxProcess,
  dockerCompose,
  frpTunnel,
  waitForPort,
  waitForHealth,
} from '@agent-qa/core/helpers';
```

## Documentation

- [Getting Started](../../docs/getting-started.md)
- [Configuration](../../docs/configuration.md)
- [YAML Scenarios](../../docs/yaml-scenarios.md)
- [CLI Reference](../../docs/cli.md)

## License

MIT
