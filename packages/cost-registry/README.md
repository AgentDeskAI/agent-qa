# @agent-qa/cost-registry

Unified cost registry for LLM pricing and token counting across providers.

## Installation

```bash
npm install @agent-qa/cost-registry
# or
pnpm add @agent-qa/cost-registry
```

## Features

- Calculate LLM costs from token usage (Anthropic, OpenAI)
- Provider-specific pricing strategies
- Token counting with tiktoken (local) or Anthropic API (async)
- Extensible pricing registry pattern

## Usage

### Calculate Costs

```typescript
import { CostRegistry } from '@agent-qa/cost-registry';

const registry = CostRegistry.default();

const cost = registry.calculate({
  source: 'llm',
  provider: 'anthropic',
  model: 'claude-3-5-haiku-latest',
  usage: { inputTokens: 1000, outputTokens: 100 },
});

console.log(`Cost: $${cost.totalCost.toFixed(4)}`);
```

### Count Tokens

```typescript
import { createTokenCounter } from '@agent-qa/cost-registry';

// Count tokens locally with tiktoken
const counter = createTokenCounter();
const tokens = counter('Hello, world!');

// Count tokens via Anthropic API
const asyncCounter = createTokenCounter({ model: 'claude-sonnet-4-5' });
const count = await asyncCounter('Hello, world!');
```

## Subpath Exports

| Path | Description |
|------|-------------|
| `@agent-qa/cost-registry` | Main exports |
| `@agent-qa/cost-registry/rates` | Pricing strategies |
| `@agent-qa/cost-registry/counting` | Token counters |

## Supported Models

**Anthropic:**
- claude-opus-4-5, claude-sonnet-4-5
- claude-3-5-sonnet, claude-3-5-haiku
- claude-3-opus, claude-3-haiku

**OpenAI:**
- gpt-4o, gpt-4o-mini
- gpt-4-turbo, gpt-4
- gpt-3.5-turbo

## API Reference

### CostRegistry

```typescript
class CostRegistry {
  static default(): CostRegistry;
  calculate(input: CostCalculationInput): CostResult;
}
```

### Pricing Strategies

```typescript
import {
  createPricingStrategy,
  anthropicPricing,
  openaiPricing,
  ANTHROPIC_PRICING,
  OPENAI_PRICING,
} from '@agent-qa/cost-registry/rates';
```

### Token Counters

```typescript
import {
  createTokenCounter,
  createAnthropicCounter,
} from '@agent-qa/cost-registry/counting';
```

## License

MIT
