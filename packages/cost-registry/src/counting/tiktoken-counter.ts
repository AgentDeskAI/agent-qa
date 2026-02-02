/**
 * Tiktoken-based token counter.
 */

import { getEncoding, type Tiktoken } from 'js-tiktoken';

import type { TokenCounter, TokenCounterOptions, SyncTokenCounter } from './types.js';
import { createAnthropicCounter } from './anthropic-counter.js';

/**
 * Default encoding for token counting.
 */
const DEFAULT_ENCODING = 'cl100k_base';

/**
 * Create a tiktoken-based token counter.
 */
function createTiktokenCounter(encoding: string = DEFAULT_ENCODING): SyncTokenCounter {
  let encoder: Tiktoken | null = null;

  const getEncoder = (): Tiktoken => {
    if (!encoder) {
      encoder = getEncoding(encoding as Parameters<typeof getEncoding>[0]);
    }
    return encoder;
  };

  const counter = (text: string): number => {
    if (!text) return 0;
    return getEncoder().encode(text).length;
  };

  Object.defineProperty(counter, 'isAsync', {
    value: false as const,
    writable: false,
    enumerable: true,
  });
  Object.defineProperty(counter, 'getEncodingOrModel', {
    value: () => encoding,
    writable: false,
    enumerable: true,
  });

  return counter as SyncTokenCounter;
}

/**
 * Create a token counter.
 *
 * Returns a sync counter (tiktoken) by default, or an async counter (Anthropic API)
 * when the `model` option is provided.
 */
export function createTokenCounter(options?: TokenCounterOptions): TokenCounter {
  if (options?.model) {
    try {
      return createAnthropicCounter({
        model: options.model,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
      });
    } catch {
      // Fallback to tiktoken if Anthropic counter fails
      return createTiktokenCounter(options?.encoding ?? DEFAULT_ENCODING);
    }
  }
  return createTiktokenCounter(options?.encoding ?? DEFAULT_ENCODING);
}
