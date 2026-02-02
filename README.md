# Agent QA

Framework-based AI agent testing with convention over configuration.

## Overview

Agent QA provides a structured approach to testing AI agents through YAML-based scenarios, built-in assertions, and flexible infrastructure management.

## Packages

| Package | Description |
|---------|-------------|
| `@agent-qa/core` | Main framework - CLI, runner, assertions, adapters |
| `@agent-qa/cost-registry` | LLM pricing and token counting utilities |
| `@agent-qa/traces-tempo` | Grafana Tempo traces provider (optional) |

## Quick Start

### 1. Install

```bash
npm install @agent-qa/core
# or
pnpm add @agent-qa/core
```

### 2. Create Config

```typescript
// agentqa.config.ts
import { defineConfig } from '@agent-qa/core';
import * as schema from './db/schema';

export default defineConfig({
  name: 'MyApp',
  agent: {
    baseUrl: '$API_URL',
    token: '$API_TOKEN',
  },
  database: {
    url: '$DATABASE_URL',
    entities: [
      { table: schema.tasks, name: 'tasks', titleColumn: 'title' },
    ],
  },
});
```

### 3. Write Scenarios

```yaml
# scenarios/suite.yaml
name: Task Management Suite
scenarios:
  - id: create-task
    name: Create a task
    steps:
      - chat: "Create a task called 'Buy groceries'"
        tools:
          createTask: 1
        created:
          - entity: tasks
            as: $newTask
            fields:
              title: "Buy groceries"
```

### 4. Run Tests

```bash
npx agentqa run scenarios/suite.yaml
```

## Features

- **YAML Scenarios**: Define test cases in readable YAML format
- **Tool Assertions**: Verify AI agent tool calls
- **Entity Assertions**: Validate database state changes
- **Response Assertions**: Check agent responses
- **Usage Tracking**: Monitor token consumption
- **Diagnostics**: Capture logs and traces on failure
- **Multi-Run Mode**: Detect flaky tests and hallucinations
- **Parallel Execution**: Run scenarios concurrently
- **Pluggable Traces**: Support for Tempo, LangFuse, Jaeger, and custom backends

## Diagnostics with Traces

Agent QA supports pluggable trace providers for capturing OpenTelemetry traces on test failures:

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

You can also implement your own `TracesProvider` for other backends like LangFuse or Jaeger.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [YAML Scenarios](docs/yaml-scenarios.md)
- [Custom Adapters](docs/adapters.md)
- [CLI Reference](docs/cli.md)

## Examples

See the [examples/demo-agent](examples/demo-agent) directory for a working example.

## License

MIT
