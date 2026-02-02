import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAnthropicCounter } from '../counting/anthropic-counter.js';
import type { AsyncTokenCounter, AnthropicCountInput } from '../counting/types.js';

describe('createAnthropicCounter', () => {
  const mockFetch = vi.fn();
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  describe('configuration', () => {
    it('throws if no API key provided and ANTHROPIC_API_KEY not set', () => {
      expect(() => createAnthropicCounter({ model: 'claude-sonnet-4-5' }))
        .toThrow('Anthropic API key required: pass apiKey option or set ANTHROPIC_API_KEY');
    });

    it('uses ANTHROPIC_API_KEY env var as fallback', () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-from-env';

      const counter = createAnthropicCounter({ model: 'claude-sonnet-4-5' });

      expect(counter).toBeDefined();
      expect(typeof counter).toBe('function');
    });

    it('uses provided apiKey option over env var', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      const providedKey = 'provided-api-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 10 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: providedKey,
      });

      await counter('test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': providedKey,
          }),
        }),
      );
    });

    it('uses default baseUrl when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 10 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      await counter('test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages/count_tokens',
        expect.any(Object),
      );
    });

    it('uses custom baseUrl when provided', async () => {
      const customBaseUrl = 'https://custom.anthropic.com';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 10 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
        baseUrl: customBaseUrl,
      });

      await counter('test');

      expect(mockFetch).toHaveBeenCalledWith(
        `${customBaseUrl}/v1/messages/count_tokens`,
        expect.any(Object),
      );
    });
  });

  describe('counter properties', () => {
    it('has isAsync = true property', () => {
      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      }) as AsyncTokenCounter;

      expect(counter.isAsync).toBe(true);
    });

    it('getEncodingOrModel returns model name', () => {
      const model = 'claude-sonnet-4-5';
      const counter = createAnthropicCounter({
        model,
        apiKey: 'test-key',
      }) as AsyncTokenCounter;

      expect(counter.getEncodingOrModel()).toBe(model);
    });
  });

  describe('string input', () => {
    it('counts tokens for simple string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 5 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      const count = await counter('Hello, world!');

      expect(count).toBe(5);
    });

    it('sends correct request body for string input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 10 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      await counter('Hello, world!');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-key',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            messages: [{ role: 'user', content: 'Hello, world!' }],
          }),
        }),
      );
    });
  });

  describe('structured input', () => {
    it('counts tokens with messages array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 20 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      const input: AnthropicCountInput = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      const count = await counter(input);

      expect(count).toBe(20);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            messages: input.messages,
          }),
        }),
      );
    });

    it('includes system prompt when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 30 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      const input: AnthropicCountInput = {
        messages: [{ role: 'user', content: 'Hello' }],
        system: 'You are a helpful assistant.',
      };

      await counter(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            messages: input.messages,
            system: input.system,
          }),
        }),
      );
    });

    it('includes tools when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 50 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      const input: AnthropicCountInput = {
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a location',
            input_schema: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
      };

      await counter(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            messages: input.messages,
            tools: input.tools,
          }),
        }),
      );
    });

    it('includes thinking config when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 25 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      const input: AnthropicCountInput = {
        messages: [{ role: 'user', content: 'Think about this carefully' }],
        thinking: { type: 'enabled', budget_tokens: 1000 },
      };

      await counter(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            messages: input.messages,
            thinking: input.thinking,
          }),
        }),
      );
    });

    it('includes all optional fields when provided together', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ input_tokens: 100 }),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      const input: AnthropicCountInput = {
        messages: [{ role: 'user', content: 'Hello' }],
        system: 'Be helpful',
        tools: [{ name: 'test_tool', input_schema: {} }],
        thinking: { type: 'disabled' },
      };

      await counter(input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            messages: input.messages,
            system: input.system,
            tools: input.tools,
            thinking: input.thinking,
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API key'),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'invalid-key',
      });

      await expect(counter('test')).rejects.toThrow('Anthropic token count failed: 401 Invalid API key');
    });

    it('throws on 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      await expect(counter('test')).rejects.toThrow('Anthropic token count failed: 404 Not found');
    });

    it('throws on 500 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      await expect(counter('test')).rejects.toThrow('Anthropic token count failed: 500 Internal server error');
    });

    it('throws on rate limit response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      const counter = createAnthropicCounter({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
      });

      await expect(counter('test')).rejects.toThrow('Anthropic token count failed: 429 Rate limit exceeded');
    });
  });
});
