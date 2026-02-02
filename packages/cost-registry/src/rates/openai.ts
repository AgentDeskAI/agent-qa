/**
 * OpenAI pricing configuration.
 *
 * Pricing as of June 2025 (Standard tier).
 * @see https://platform.openai.com/docs/pricing
 */

import type { ProviderPricing } from '../types.js';
import { createPricingStrategy } from './create-strategy.js';

/**
 * OpenAI model pricing catalog (Standard tier).
 *
 * Prices are in USD per million tokens (MTok).
 */
export const OPENAI_PRICING: ProviderPricing = {
  // GPT-5 family
  'gpt-5.2': {
    inputPer1M: 1.75,
    outputPer1M: 14.0,
    cachedInputPer1M: 0.175,
    displayName: 'GPT-5.2',
  },
  'gpt-5.1': {
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    cachedInputPer1M: 0.125,
    displayName: 'GPT-5.1',
  },
  'gpt-5': {
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    cachedInputPer1M: 0.125,
    displayName: 'GPT-5',
  },
  'gpt-5-mini': {
    inputPer1M: 0.25,
    outputPer1M: 2.0,
    cachedInputPer1M: 0.025,
    displayName: 'GPT-5 Mini',
  },
  'gpt-5-nano': {
    inputPer1M: 0.05,
    outputPer1M: 0.4,
    cachedInputPer1M: 0.005,
    displayName: 'GPT-5 Nano',
  },
  'gpt-5.2-pro': {
    inputPer1M: 21.0,
    outputPer1M: 168.0,
    displayName: 'GPT-5.2 Pro',
  },
  'gpt-5-pro': {
    inputPer1M: 15.0,
    outputPer1M: 120.0,
    displayName: 'GPT-5 Pro',
  },

  // GPT-4.1 family
  'gpt-4.1': {
    inputPer1M: 2.0,
    outputPer1M: 8.0,
    cachedInputPer1M: 0.5,
    displayName: 'GPT-4.1',
  },
  'gpt-4.1-mini': {
    inputPer1M: 0.4,
    outputPer1M: 1.6,
    cachedInputPer1M: 0.1,
    displayName: 'GPT-4.1 Mini',
  },
  'gpt-4.1-nano': {
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    cachedInputPer1M: 0.025,
    displayName: 'GPT-4.1 Nano',
  },

  // GPT-4o family
  'gpt-4o': {
    inputPer1M: 2.5,
    outputPer1M: 10.0,
    cachedInputPer1M: 1.25,
    displayName: 'GPT-4o',
  },
  'gpt-4o-2024-05-13': {
    inputPer1M: 5.0,
    outputPer1M: 15.0,
    displayName: 'GPT-4o (2024-05-13)',
  },
  'gpt-4o-mini': {
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    cachedInputPer1M: 0.075,
    displayName: 'GPT-4o Mini',
  },

  // O-series (Reasoning models)
  o1: {
    inputPer1M: 15.0,
    outputPer1M: 60.0,
    cachedInputPer1M: 7.5,
    displayName: 'O1',
  },
  'o1-pro': {
    inputPer1M: 150.0,
    outputPer1M: 600.0,
    displayName: 'O1 Pro',
  },
  'o1-mini': {
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    cachedInputPer1M: 0.55,
    displayName: 'O1 Mini',
  },
  'o3-pro': {
    inputPer1M: 20.0,
    outputPer1M: 80.0,
    displayName: 'O3 Pro',
  },
  o3: {
    inputPer1M: 2.0,
    outputPer1M: 8.0,
    cachedInputPer1M: 0.5,
    displayName: 'O3',
  },
  'o3-deep-research': {
    inputPer1M: 10.0,
    outputPer1M: 40.0,
    cachedInputPer1M: 2.5,
    displayName: 'O3 Deep Research',
  },
  'o3-mini': {
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    cachedInputPer1M: 0.55,
    displayName: 'O3 Mini',
  },
  'o4-mini': {
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    cachedInputPer1M: 0.275,
    displayName: 'O4 Mini',
  },
  'o4-mini-deep-research': {
    inputPer1M: 2.0,
    outputPer1M: 8.0,
    cachedInputPer1M: 0.5,
    displayName: 'O4 Mini Deep Research',
  },

  // Legacy models
  'chatgpt-4o-latest': {
    inputPer1M: 5.0,
    outputPer1M: 15.0,
    displayName: 'ChatGPT-4o Latest',
  },
  'gpt-4-turbo': {
    inputPer1M: 10.0,
    outputPer1M: 30.0,
    displayName: 'GPT-4 Turbo',
  },
  'gpt-4': {
    inputPer1M: 30.0,
    outputPer1M: 60.0,
    displayName: 'GPT-4',
  },
  'gpt-4-32k': {
    inputPer1M: 60.0,
    outputPer1M: 120.0,
    displayName: 'GPT-4 32K',
  },
  'gpt-3.5-turbo': {
    inputPer1M: 0.5,
    outputPer1M: 1.5,
    displayName: 'GPT-3.5 Turbo',
  },
  'gpt-3.5-turbo-16k': {
    inputPer1M: 3.0,
    outputPer1M: 4.0,
    displayName: 'GPT-3.5 Turbo 16K',
  },
};

/**
 * OpenAI model ID aliases.
 */
const OPENAI_ALIASES: Record<string, string> = {
  // GPT-5 aliases
  'gpt-5.2-chat-latest': 'gpt-5.2',
  'gpt-5.1-chat-latest': 'gpt-5.1',
  'gpt-5-chat-latest': 'gpt-5',
  'gpt-5.1-codex-max': 'gpt-5.1',
  'gpt-5.1-codex': 'gpt-5.1',
  'gpt-5-codex': 'gpt-5',
  'gpt-5.1-codex-mini': 'gpt-5-mini',

  // GPT-4.1 versioned aliases
  'gpt-4.1-2025-04-14': 'gpt-4.1',
  'gpt-4.1-mini-2025-04-14': 'gpt-4.1-mini',
  'gpt-4.1-nano-2025-04-14': 'gpt-4.1-nano',

  // GPT-4o versioned aliases
  'gpt-4o-2024-11-20': 'gpt-4o',
  'gpt-4o-2024-08-06': 'gpt-4o',
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',

  // O-series versioned aliases
  'o1-2024-12-17': 'o1',
  'o1-preview': 'o1',
  'o1-preview-2024-09-12': 'o1',
  'o1-mini-2024-09-12': 'o1-mini',
  'o4-mini-2025-04-16': 'o4-mini',

  // GPT-4 Turbo versioned aliases
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
  'gpt-4-turbo-preview': 'gpt-4-turbo',
  'gpt-4-0125-preview': 'gpt-4-turbo',
  'gpt-4-1106-preview': 'gpt-4-turbo',

  // GPT-4 versioned aliases
  'gpt-4-0613': 'gpt-4',
  'gpt-4-0314': 'gpt-4',
  'gpt-4-32k-0613': 'gpt-4-32k',
  'gpt-4-32k-0314': 'gpt-4-32k',

  // GPT-3.5 versioned aliases
  'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-0613': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k-0613': 'gpt-3.5-turbo-16k',
};

/**
 * Pre-configured OpenAI pricing strategy.
 */
export const openaiPricing = createPricingStrategy({
  provider: 'openai',
  catalog: OPENAI_PRICING,
  aliases: OPENAI_ALIASES,
});
