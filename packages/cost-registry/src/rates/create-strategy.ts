/**
 * Factory for creating pricing strategies from catalogs.
 */

import type { TokenUsage, CostResult, ModelPricing, ProviderPricing, PricingStrategy } from '../types.js';

/**
 * Default currency for cost estimates.
 */
const DEFAULT_CURRENCY = 'USD';

/**
 * Calculate cost from pricing and usage.
 */
function calculateCostFromPricing(pricing: ModelPricing, usage: TokenUsage): CostResult {
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M;

  // Check if we have separate cache write/read tokens
  const hasCacheBreakdown = usage.cacheCreationTokens !== undefined || usage.cacheReadTokens !== undefined;

  let cachedInputCost = 0;
  let cacheWriteCost = 0;
  let cacheReadCost = 0;

  if (hasCacheBreakdown) {
    // Use separate cache write/read rates
    cacheWriteCost = pricing.cacheWritePer1M
      ? ((usage.cacheCreationTokens ?? 0) / 1_000_000) * pricing.cacheWritePer1M
      : 0;
    cacheReadCost = pricing.cacheReadPer1M
      ? ((usage.cacheReadTokens ?? 0) / 1_000_000) * pricing.cacheReadPer1M
      : 0;
    // For backwards compat, set cachedInputCost to sum of write + read
    cachedInputCost = cacheWriteCost + cacheReadCost;
  } else if (usage.cachedInputTokens) {
    // Legacy: use aggregate cached input rate
    cachedInputCost = pricing.cachedInputPer1M
      ? (usage.cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M
      : 0;
  }

  return {
    inputCost,
    outputCost,
    cachedInputCost,
    cacheWriteCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost + (hasCacheBreakdown ? 0 : cachedInputCost),
    currency: DEFAULT_CURRENCY,
  };
}

/**
 * Internal implementation of PricingStrategy.
 */
class PricingStrategyImpl implements PricingStrategy {
  readonly provider: string;
  private readonly catalog: ProviderPricing;
  private readonly aliases: Map<string, string>;

  constructor(provider: string, catalog: ProviderPricing, aliases?: Record<string, string>) {
    this.provider = provider;
    this.catalog = catalog;
    this.aliases = new Map(Object.entries(aliases ?? {}));
  }

  getPricing(modelId: string): ModelPricing | undefined {
    // Try direct match first
    if (this.catalog[modelId]) {
      return this.catalog[modelId];
    }

    // Try alias
    const aliasedId = this.aliases.get(modelId);
    if (aliasedId && this.catalog[aliasedId]) {
      return this.catalog[aliasedId];
    }

    // Try partial match (e.g., "claude-3-5-haiku" matches "claude-3-5-haiku-latest")
    for (const [key, pricing] of Object.entries(this.catalog)) {
      if (modelId.includes(key) || key.includes(modelId)) {
        return pricing;
      }
    }

    return undefined;
  }

  calculateCost(modelId: string, usage: TokenUsage): CostResult {
    const pricing = this.getPricing(modelId);

    if (!pricing) {
      // Return zero cost if pricing not found
      return {
        inputCost: 0,
        outputCost: 0,
        cachedInputCost: 0,
        cacheWriteCost: 0,
        cacheReadCost: 0,
        totalCost: 0,
        currency: DEFAULT_CURRENCY,
      };
    }

    return calculateCostFromPricing(pricing, usage);
  }

  listModels(): string[] {
    return Object.keys(this.catalog);
  }

  hasModel(modelId: string): boolean {
    return this.getPricing(modelId) !== undefined;
  }
}

/**
 * Options for creating a pricing strategy.
 */
export interface CreatePricingStrategyOptions {
  /** Provider name */
  provider: string;
  /** Pricing catalog */
  catalog: ProviderPricing;
  /** Model ID aliases */
  aliases?: Record<string, string>;
}

/**
 * Create a pricing strategy from a catalog.
 */
export function createPricingStrategy(options: CreatePricingStrategyOptions): PricingStrategy {
  return new PricingStrategyImpl(options.provider, options.catalog, options.aliases);
}
