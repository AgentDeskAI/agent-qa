/**
 * Core types for the cost registry.
 */

/**
 * Cost source types - extensible for future cost tracking.
 */
export type CostSource = 'llm' | 'database' | 'api' | 'compute';

/**
 * Token usage from a single LLM call.
 */
export interface TokenUsage {
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Number of cached input tokens (legacy aggregate) */
  cachedInputTokens?: number;
  /** Number of cache creation tokens (written to cache) */
  cacheCreationTokens?: number;
  /** Number of cache read tokens (read from cache) */
  cacheReadTokens?: number;
  /** Number of reasoning tokens (extended thinking) */
  reasoningTokens?: number;
}

/**
 * Pricing configuration for a single model.
 */
export interface ModelPricing {
  /** Cost per 1 million input tokens (USD) */
  inputPer1M: number;
  /** Cost per 1 million output tokens (USD) */
  outputPer1M: number;
  /** Cost per 1 million cached input tokens (USD) - legacy */
  cachedInputPer1M?: number;
  /** Cost per 1 million cache write tokens (USD) */
  cacheWritePer1M?: number;
  /** Cost per 1 million cache read tokens (USD) */
  cacheReadPer1M?: number;
  /** Human-readable display name */
  displayName?: string;
}

/**
 * Pricing catalog mapping model IDs to their pricing.
 */
export interface ProviderPricing {
  [modelId: string]: ModelPricing;
}

/**
 * Cost calculation result.
 */
export interface CostResult {
  /** Cost for input tokens */
  inputCost: number;
  /** Cost for output tokens */
  outputCost: number;
  /** Cost for cached input tokens (legacy) */
  cachedInputCost: number;
  /** Cost for cache write tokens */
  cacheWriteCost: number;
  /** Cost for cache read tokens */
  cacheReadCost: number;
  /** Total cost */
  totalCost: number;
  /** Currency code */
  currency: string;
}

/**
 * Input for cost calculation.
 */
export interface CostCalculationInput {
  /** Cost source type */
  source: CostSource;
  /** Provider name (e.g., 'anthropic', 'openai') */
  provider: string;
  /** Model identifier */
  model: string;
  /** Token usage */
  usage: TokenUsage;
}

/**
 * Generic cost rate definition.
 */
export interface CostRate {
  /** Cost source type */
  source: CostSource;
  /** Provider name */
  provider: string;
  /** Model identifier (for LLM) */
  model?: string;
  /** Operation type (for DB: 'read', 'write') */
  operation?: string;
  /** Rate per input token (LLM) */
  inputRate?: number;
  /** Rate per output token (LLM) */
  outputRate?: number;
  /** Rate per unit (generic) */
  ratePerUnit?: number;
  /** Rate per API call */
  ratePerCall?: number;
  /** Rate per millisecond (compute) */
  ratePerMs?: number;
}

/**
 * Pricing strategy interface for provider-specific pricing.
 */
export interface PricingStrategy {
  /** Provider name */
  readonly provider: string;

  /**
   * Get pricing configuration for a model.
   */
  getPricing(modelId: string): ModelPricing | undefined;

  /**
   * Calculate cost from token usage.
   */
  calculateCost(modelId: string, usage: TokenUsage): CostResult;

  /**
   * List all available model IDs.
   */
  listModels(): string[];

  /**
   * Check if a model ID is supported.
   */
  hasModel(modelId: string): boolean;
}
