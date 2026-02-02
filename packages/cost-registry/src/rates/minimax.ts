/**
 * MiniMax pricing configuration.
 *
 * MiniMax provides Anthropic-compatible APIs at lower cost.
 * Pricing as of January 2026.
 * @see https://platform.minimax.io/docs/pricing
 */

import type { ProviderPricing } from '../types.js';
import { createPricingStrategy } from './create-strategy.js';

/**
 * MiniMax model pricing catalog.
 *
 * Prices are in USD per million tokens (MTok).
 * Cache read is 0.1x input, cache write is 1.25x input.
 */
export const MINIMAX_PRICING: ProviderPricing = {
  'MiniMax-M2.1': {
    inputPer1M: 0.3,
    outputPer1M: 1.2,
    cachedInputPer1M: 0.03,
    cacheWritePer1M: 0.375,
    cacheReadPer1M: 0.03,
    displayName: 'MiniMax M2.1',
  },
  'MiniMax-M2.1-lightning': {
    inputPer1M: 0.3,
    outputPer1M: 2.4,
    cachedInputPer1M: 0.03,
    cacheWritePer1M: 0.375,
    cacheReadPer1M: 0.03,
    displayName: 'MiniMax M2.1 Lightning',
  },
  'MiniMax-M2': {
    inputPer1M: 0.3,
    outputPer1M: 1.2,
    cachedInputPer1M: 0.03,
    cacheWritePer1M: 0.375,
    cacheReadPer1M: 0.03,
    displayName: 'MiniMax M2',
  },
};

/**
 * MiniMax model ID aliases.
 */
const MINIMAX_ALIASES: Record<string, string> = {
  // Lowercase aliases
  'minimax-m2.1': 'MiniMax-M2.1',
  'minimax-m2.1-lightning': 'MiniMax-M2.1-lightning',
  'minimax-m2': 'MiniMax-M2',

  // Common shorthand
  'm2.1': 'MiniMax-M2.1',
  'm2.1-lightning': 'MiniMax-M2.1-lightning',
  'm2': 'MiniMax-M2',
};

/**
 * Pre-configured MiniMax pricing strategy.
 */
export const minimaxPricing = createPricingStrategy({
  provider: 'minimax',
  catalog: MINIMAX_PRICING,
  aliases: MINIMAX_ALIASES,
});
