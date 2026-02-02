/**
 * CostRegistry - Unified cost calculation for multiple providers.
 */

import type {
  CostResult,
  CostCalculationInput,
  CostRate,
  PricingStrategy,
  TokenUsage,
} from './types.js';
import { anthropicPricing } from './rates/anthropic.js';
import { openaiPricing } from './rates/openai.js';
import { minimaxPricing } from './rates/minimax.js';

/**
 * Default currency for cost estimates.
 */
const DEFAULT_CURRENCY = 'USD';

/**
 * Zero cost result.
 */
const ZERO_COST: CostResult = {
  inputCost: 0,
  outputCost: 0,
  cachedInputCost: 0,
  cacheWriteCost: 0,
  cacheReadCost: 0,
  totalCost: 0,
  currency: DEFAULT_CURRENCY,
};

/**
 * CostRegistry - Single source of truth for cost calculation.
 *
 * Provides a unified API for calculating costs across multiple providers
 * and cost sources (LLM, database, API, compute).
 *
 * @example
 * ```typescript
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
 */
export class CostRegistry {
  private strategies: Map<string, PricingStrategy> = new Map();
  private customRates: Map<string, CostRate> = new Map();

  /**
   * Create a CostRegistry with default provider strategies.
   */
  static default(): CostRegistry {
    const registry = new CostRegistry();
    registry.registerStrategy(anthropicPricing);
    registry.registerStrategy(openaiPricing);
    registry.registerStrategy(minimaxPricing);
    return registry;
  }

  /**
   * Create an empty CostRegistry.
   */
  static empty(): CostRegistry {
    return new CostRegistry();
  }

  /**
   * Register a pricing strategy for a provider.
   */
  registerStrategy(strategy: PricingStrategy): void {
    this.strategies.set(strategy.provider, strategy);
  }

  /**
   * Register a custom cost rate.
   */
  registerRate(rate: CostRate): void {
    const key = this.rateKey(rate);
    this.customRates.set(key, rate);
  }

  /**
   * Calculate cost for an LLM call.
   */
  calculate(input: CostCalculationInput): CostResult {
    if (input.source !== 'llm') {
      return this.calculateNonLLM(input);
    }

    const strategy = this.strategies.get(input.provider);
    if (!strategy) {
      return { ...ZERO_COST };
    }

    return strategy.calculateCost(input.model, input.usage);
  }

  /**
   * Calculate cost for a simple LLM usage.
   */
  calculateLLM(
    provider: string,
    model: string,
    usage: TokenUsage
  ): CostResult {
    return this.calculate({
      source: 'llm',
      provider,
      model,
      usage,
    });
  }

  /**
   * Get a pricing strategy by provider name.
   */
  getStrategy(provider: string): PricingStrategy | undefined {
    return this.strategies.get(provider);
  }

  /**
   * Check if a provider is registered.
   */
  hasProvider(provider: string): boolean {
    return this.strategies.has(provider);
  }

  /**
   * List all registered providers.
   */
  listProviders(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Calculate cost for non-LLM sources.
   */
  private calculateNonLLM(input: CostCalculationInput): CostResult {
    const key = `${input.source}:${input.provider}:${input.model ?? ''}`;
    const rate = this.customRates.get(key);

    if (!rate) {
      return { ...ZERO_COST };
    }

    // Calculate based on rate type
    let totalCost = 0;
    if (rate.ratePerCall !== undefined) {
      totalCost = rate.ratePerCall;
    } else if (rate.ratePerUnit !== undefined) {
      totalCost = rate.ratePerUnit * (input.usage.inputTokens + input.usage.outputTokens);
    }

    return {
      inputCost: 0,
      outputCost: 0,
      cachedInputCost: 0,
      cacheWriteCost: 0,
      cacheReadCost: 0,
      totalCost,
      currency: DEFAULT_CURRENCY,
    };
  }

  /**
   * Generate a unique key for a rate.
   */
  private rateKey(rate: CostRate): string {
    return `${rate.source}:${rate.provider}:${rate.model ?? ''}`;
  }
}
