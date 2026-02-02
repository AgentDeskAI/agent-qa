/**
 * Anthropic pricing configuration.
 *
 * Pricing as of June 2025.
 * @see https://platform.claude.com/docs/en/about-claude/pricing
 */

import type { ProviderPricing } from '../types.js';
import { createPricingStrategy } from './create-strategy.js';

/**
 * Anthropic model pricing catalog.
 *
 * Prices are in USD per million tokens (MTok).
 * Cache prices are for "Cache Hits & Refreshes" (reads).
 */
export const ANTHROPIC_PRICING: ProviderPricing = {
  // Claude 4.5 family
  'claude-opus-4-5': {
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cachedInputPer1M: 0.5,
    cacheWritePer1M: 6.25,
    cacheReadPer1M: 0.5,
    displayName: 'Claude Opus 4.5',
  },
  'claude-sonnet-4-5': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.3,
    displayName: 'Claude Sonnet 4.5',
  },
  'claude-haiku-4-5': {
    inputPer1M: 1.0,
    outputPer1M: 5.0,
    cachedInputPer1M: 0.1,
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.1,
    displayName: 'Claude Haiku 4.5',
  },

  // Claude 4 family
  'claude-opus-4-1': {
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cachedInputPer1M: 1.5,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.5,
    displayName: 'Claude Opus 4.1',
  },
  'claude-opus-4': {
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cachedInputPer1M: 1.5,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.5,
    displayName: 'Claude Opus 4',
  },
  'claude-sonnet-4': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.3,
    displayName: 'Claude Sonnet 4',
  },

  // Claude 3.7 (deprecated)
  'claude-sonnet-3-7': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.3,
    displayName: 'Claude Sonnet 3.7 (Deprecated)',
  },

  // Claude 3.5 family
  'claude-haiku-3-5': {
    inputPer1M: 0.8,
    outputPer1M: 4.0,
    cachedInputPer1M: 0.08,
    cacheWritePer1M: 1.0,
    cacheReadPer1M: 0.08,
    displayName: 'Claude Haiku 3.5',
  },

  // Claude 3 family
  'claude-opus-3': {
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cachedInputPer1M: 1.5,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.5,
    displayName: 'Claude 3 Opus (Deprecated)',
  },
  'claude-haiku-3': {
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cachedInputPer1M: 0.03,
    cacheWritePer1M: 0.3125,
    cacheReadPer1M: 0.025,
    displayName: 'Claude 3 Haiku',
  },
};

/**
 * Anthropic model ID aliases.
 */
const ANTHROPIC_ALIASES: Record<string, string> = {
  // Claude 4.5 aliases
  'claude-opus-4-5-20251101': 'claude-opus-4-5',
  'claude-sonnet-4-5-20250514': 'claude-sonnet-4-5',
  'claude-haiku-4-5-20250514': 'claude-haiku-4-5',

  // Claude 4.1 aliases
  'claude-opus-4-1-20250514': 'claude-opus-4-1',

  // Claude 4 aliases
  'claude-opus-4-20250514': 'claude-opus-4',
  'claude-sonnet-4-20250514': 'claude-sonnet-4',

  // Claude 3.7 aliases
  'claude-3-7-sonnet': 'claude-sonnet-3-7',
  'claude-3-7-sonnet-20250219': 'claude-sonnet-3-7',
  'claude-sonnet-3-7-20250219': 'claude-sonnet-3-7',

  // Claude 3.5 aliases
  'claude-3-5-haiku': 'claude-haiku-3-5',
  'claude-3-5-haiku-latest': 'claude-haiku-3-5',
  'claude-3-5-haiku-20241022': 'claude-haiku-3-5',

  // Claude 3.5 Sonnet -> Sonnet 4 (same price point)
  'claude-3-5-sonnet': 'claude-sonnet-4',
  'claude-3-5-sonnet-latest': 'claude-sonnet-4',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4',
  'claude-3-5-sonnet-20240620': 'claude-sonnet-4',

  // Claude 3 aliases
  'claude-3-opus': 'claude-opus-3',
  'claude-3-opus-latest': 'claude-opus-3',
  'claude-3-opus-20240229': 'claude-opus-3',
  'claude-3-haiku': 'claude-haiku-3',
  'claude-3-haiku-20240307': 'claude-haiku-3',

  // Common shorthand aliases
  'opus-4.5': 'claude-opus-4-5',
  'opus-4': 'claude-opus-4',
  'sonnet-4.5': 'claude-sonnet-4-5',
  'sonnet-4': 'claude-sonnet-4',
  'haiku-4.5': 'claude-haiku-4-5',
  'haiku-3.5': 'claude-haiku-3-5',
  'haiku-3': 'claude-haiku-3',
};

/**
 * Pre-configured Anthropic pricing strategy.
 */
export const anthropicPricing = createPricingStrategy({
  provider: 'anthropic',
  catalog: ANTHROPIC_PRICING,
  aliases: ANTHROPIC_ALIASES,
});
