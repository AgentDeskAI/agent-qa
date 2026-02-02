/**
 * Anthropic API-based token counter.
 */

import type { AsyncTokenCounter, AnthropicCountInput } from './types.js';

interface AnthropicCounterConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
}

/**
 * Create an Anthropic API-based token counter.
 */
export function createAnthropicCounter(options: {
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): AsyncTokenCounter {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key required: pass apiKey option or set ANTHROPIC_API_KEY');
  }

  const config: AnthropicCounterConfig = {
    model: options.model,
    apiKey,
    baseUrl: options.baseUrl ?? 'https://api.anthropic.com',
  };

  const counter = async (input: string | AnthropicCountInput): Promise<number> => {
    const requestBody = typeof input === 'string'
      ? {
          model: config.model,
          messages: [{ role: 'user' as const, content: input }],
        }
      : {
          model: config.model,
          messages: input.messages,
          ...(input.system && { system: input.system }),
          ...(input.tools && { tools: input.tools }),
          ...(input.thinking && { thinking: input.thinking }),
        };

    const response = await fetch(`${config.baseUrl}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic token count failed: ${response.status} ${error}`);
    }

    const result = await response.json() as { input_tokens: number };
    return result.input_tokens;
  };

  Object.defineProperty(counter, 'isAsync', {
    value: true as const,
    writable: false,
    enumerable: true,
  });
  Object.defineProperty(counter, 'getEncodingOrModel', {
    value: () => config.model,
    writable: false,
    enumerable: true,
  });

  return counter as AsyncTokenCounter;
}
