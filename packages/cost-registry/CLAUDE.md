# CLAUDE.md - @agent-qa/cost-registry

Unified cost registry for LLM pricing and token counting.

## Package Structure

```
packages/cost-registry/
├── src/
│   ├── rates/              # Pricing data and lookup
│   │   ├── index.ts        # Rate registry exports
│   │   └── pricing.ts      # Model pricing data
│   ├── counting/           # Token counting utilities
│   │   ├── index.ts        # Counting exports
│   │   └── counter.ts      # Token counter implementation
│   └── index.ts            # Main exports
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
```

## Key Exports

### Pricing

```typescript
import { getModelPricing, calculateCost } from '@agent-qa/cost-registry';
import { getModelPricing } from '@agent-qa/cost-registry/rates';

// Get pricing for a model
const pricing = getModelPricing('claude-sonnet-4-20250514');

// Calculate cost
const cost = calculateCost({
  model: 'claude-sonnet-4-20250514',
  inputTokens: 1000,
  outputTokens: 500,
});
```

### Token Counting

```typescript
import { countTokens } from '@agent-qa/cost-registry';
import { countTokens } from '@agent-qa/cost-registry/counting';

// Count tokens in text
const count = countTokens('Hello, world!', 'claude-sonnet-4-20250514');
```

## Dependencies

- **js-tiktoken**: Token counting library

## Usage in Agent QA

This package is used by `@agent-qa/core` for:
- Calculating costs from token usage
- Reporting cost metrics in test results
- Token counting for Zod schema analysis

## Adding New Models

1. Add pricing data in `src/rates/pricing.ts`
2. Add tests for the new model
3. Update this CLAUDE.md if needed

## Pricing Format

```typescript
interface ModelPricing {
  inputPerMillion: number;   // USD per million input tokens
  outputPerMillion: number;  // USD per million output tokens
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}
```
