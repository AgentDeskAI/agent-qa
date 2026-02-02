/**
 * @agentdesk/cost-registry
 *
 * Unified cost registry for LLM pricing and token counting.
 *
 * @example
 * ```typescript
 * import { CostRegistry } from '@agentdesk/cost-registry';
 *
 * const registry = CostRegistry.default();
 *
 * const cost = registry.calculate({
 *   source: 'llm',
 *   provider: 'anthropic',
 *   model: 'claude-3-5-haiku-latest',
 *   usage: { inputTokens: 1000, outputTokens: 100 },
 * });
 *
 * console.log(`Total cost: $${cost.totalCost.toFixed(4)}`);
 * ```
 *
 * @example
 * ```typescript
 * import { createTokenCounter } from '@agentdesk/cost-registry';
 *
 * // Local tiktoken counting (sync)
 * const counter = createTokenCounter();
 * const tokens = counter('Hello, world!');
 *
 * // Anthropic API counting (async)
 * const asyncCounter = createTokenCounter({ model: 'claude-sonnet-4-5' });
 * const asyncTokens = await asyncCounter('Hello, world!');
 * ```
 */

// Registry
export { CostRegistry } from './registry.js';

// Types
export type {
  CostSource,
  TokenUsage,
  ModelPricing,
  ProviderPricing,
  CostResult,
  CostCalculationInput,
  CostRate,
  PricingStrategy,
} from './types.js';

// Rates
export {
  createPricingStrategy,
  anthropicPricing,
  openaiPricing,
  minimaxPricing,
  ANTHROPIC_PRICING,
  OPENAI_PRICING,
  MINIMAX_PRICING,
} from './rates/index.js';
export type { CreatePricingStrategyOptions } from './rates/index.js';

// Token counting
export {
  createTokenCounter,
  createAnthropicCounter,
} from './counting/index.js';
export type {
  TiktokenEncoding,
  AnthropicModel,
  AnthropicMessage,
  AnthropicTool,
  AnthropicCountInput,
  TokenCounterOptions,
  SyncTokenCounter,
  AsyncTokenCounter,
  TokenCounter,
} from './counting/index.js';
