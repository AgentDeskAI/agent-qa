/**
 * Tests for HTTP Agent Adapter
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createHttpAgent } from '../adapters/agent/http-agent.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HTTP Agent Adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createHttpAgent', () => {
    it('should send correct request with default options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Hello!', conversationId: 'conv_123' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({
        message: 'Hi there',
        userId: 'user_1',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('http://localhost:4000/v1/chat');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-token');

      const body = JSON.parse(options.body);
      expect(body.message).toBe('Hi there');
      expect(body.userId).toBe('user_1');

      expect(response.text).toBe('Hello!');
      expect(response.conversationId).toBe('conv_123');
    });

    it('should use custom chat endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        chatEndpoint: '/api/v2/message',
      });

      await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:4000/api/v2/message');
    });

    it('should include custom headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      await agent.chat({ message: 'Test', userId: 'user_1' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Custom-Header']).toBe('custom-value');
    });

    it('should include maxToolCalls in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      await agent.chat({
        message: 'Test',
        userId: 'user_1',
        maxToolCalls: 10,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.maxToolCalls).toBe(10);
    });

    it('should include conversationId in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      await agent.chat({
        message: 'Test',
        userId: 'user_1',
        conversationId: 'conv_existing',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.conversationId).toBe('conv_existing');
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      await expect(agent.chat({ message: 'Test', userId: 'user_1' }))
        .rejects.toThrow('HTTP 400: Bad Request');
    });

    it('should throw on non-object response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => 'not an object',
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      await expect(agent.chat({ message: 'Test', userId: 'user_1' }))
        .rejects.toThrow('Invalid response: expected object');
    });
  });

  describe('retry behavior', () => {
    it('should retry on 502 status', async () => {
      // First call fails with 502, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: async () => 'Bad Gateway',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'OK after retry' }),
        });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        retries: 2,
        retryDelay: 10, // Short delay for tests
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.text).toBe('OK after retry');
    });

    it('should retry on 503 status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'OK' }),
        });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        retries: 1,
        retryDelay: 10,
      });

      await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 504 status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 504,
          text: async () => 'Gateway Timeout',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'OK' }),
        });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        retries: 1,
        retryDelay: 10,
      });

      await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable status', async () => {
      // Use mockResolvedValue to handle any potential extra calls
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        retries: 3,
        retryDelay: 10,
      });

      await expect(agent.chat({ message: 'Test', userId: 'user_1' }))
        .rejects.toThrow('HTTP 400: Bad Request');

      // Should only be called once since 400 is not retryable
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw last error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway',
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        retries: 2,
        retryDelay: 10,
      });

      await expect(agent.chat({ message: 'Test', userId: 'user_1' }))
        .rejects.toThrow('HTTP 502: Bad Gateway');

      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use custom retryOn status codes', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'OK' }),
        });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        retries: 1,
        retryDelay: 10,
        retryOn: [429], // Custom retry on rate limit
      });

      await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ text: 'OK after network retry' }),
        });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
        retries: 1,
        retryDelay: 10,
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.text).toBe('OK after network retry');
    });
  });

  describe('response normalization', () => {
    it('should normalize text field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Response text' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });
      expect(response.text).toBe('Response text');
    });

    it('should normalize message field to text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Response message' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });
      expect(response.text).toBe('Response message');
    });

    it('should normalize assistantMessage field to text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ assistantMessage: 'Assistant response' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });
      expect(response.text).toBe('Assistant response');
    });

    it('should normalize nested data.assistantMessage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { assistantMessage: 'Nested response' },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });
      expect(response.text).toBe('Nested response');
    });

    it('should normalize PocketCoach format (parts array)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            assistantMessage: {
              role: 'assistant',
              parts: [{ type: 'text', text: 'PocketCoach response' }],
            },
          },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });
      expect(response.text).toBe('PocketCoach response');
    });

    it('should normalize threadId to conversationId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK', threadId: 'thread_123' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });
      expect(response.conversationId).toBe('thread_123');
    });

    it('should extract correlationId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK', correlationId: 'corr_456' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });
      expect(response.correlationId).toBe('corr_456');
    });
  });

  describe('tool calls normalization', () => {
    it('should normalize toolCalls array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          toolCalls: [
            { name: 'createTask', args: { title: 'New Task' }, result: { id: '123' } },
          ],
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls[0].name).toBe('createTask');
      expect(response.toolCalls[0].args).toEqual({ title: 'New Task' });
      expect(response.toolCalls[0].result).toEqual({ id: '123' });
    });

    it('should normalize tools array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          tools: [
            { toolName: 'searchTasks', input: { query: 'test' } },
          ],
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls[0].name).toBe('searchTasks');
      expect(response.toolCalls[0].args).toEqual({ query: 'test' });
    });

    it('should normalize OpenAI tool_calls format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          tool_calls: [
            {
              function: {
                name: 'get_weather',
                arguments: '{"location": "NYC"}',
              },
            },
          ],
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls[0].name).toBe('get_weather');
      expect(response.toolCalls[0].args).toEqual({ location: 'NYC' });
    });

    it('should extract tool calls from usage.events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            usage: {
              events: [
                { type: 'tool-call', toolName: 'createTask', input: { title: 'Test' }, result: { id: '1' } },
                { type: 'user-input', text: 'ignored' },
                { type: 'tool-call', toolName: 'updateTask', input: { id: '1', done: true } },
              ],
            },
          },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.toolCalls).toHaveLength(2);
      expect(response.toolCalls[0].name).toBe('createTask');
      expect(response.toolCalls[1].name).toBe('updateTask');
    });
  });

  describe('usage normalization', () => {
    it('should normalize standard usage format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it('should normalize OpenAI usage format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          usage: {
            prompt_tokens: 80,
            completion_tokens: 40,
            total_tokens: 120,
          },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.usage).toEqual({
        inputTokens: 80,
        outputTokens: 40,
        totalTokens: 120,
      });
    });

    it('should normalize nested totals format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          usage: {
            totals: {
              inputTokens: 200,
              outputTokens: 100,
              totalTokens: 300,
            },
          },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.usage).toEqual({
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });
    });

    it('should return undefined usage when not present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.usage).toBeUndefined();
    });
  });

  describe('detailed usage', () => {
    it('should extract detailed usage with agent summaries', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          usage: {
            agentSummaries: [
              {
                agentId: 'main',
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                callCount: 1,
                provider: 'anthropic',
                model: 'claude-3-opus',
              },
            ],
            totals: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              callCount: 1,
            },
          },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.detailedUsage?.agentSummaries).toHaveLength(1);
      expect(response.detailedUsage?.agentSummaries?.[0].agentId).toBe('main');
      expect(response.detailedUsage?.agentSummaries?.[0].provider).toBe('anthropic');
      expect(response.detailedUsage?.totals?.totalTokens).toBe(150);
    });

    it('should extract events from detailed usage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'OK',
          usage: {
            events: [
              { type: 'user-input', text: 'Hello' },
              { type: 'assistant-output', text: 'Hi there!' },
              { type: 'tool-call', toolName: 'search' },
            ],
          },
        }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.detailedUsage?.events).toHaveLength(3);
      expect(response.detailedUsage?.events?.[0].type).toBe('user-input');
      expect(response.detailedUsage?.events?.[2].toolName).toBe('search');
    });
  });

  describe('duration tracking', () => {
    it('should include duration in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'OK' }),
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('raw response', () => {
    it('should include raw response data', async () => {
      const rawData = {
        text: 'OK',
        customField: 'custom value',
        nested: { data: true },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => rawData,
      });

      const agent = createHttpAgent({
        baseUrl: 'http://localhost:4000',
        token: 'test-token',
      });

      const response = await agent.chat({ message: 'Test', userId: 'user_1' });

      expect(response.raw).toEqual(rawData);
    });
  });
});
