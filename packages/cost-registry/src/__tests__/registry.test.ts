import { describe, it, expect } from 'vitest';
import { CostRegistry } from '../registry.js';

describe('CostRegistry', () => {
  describe('default()', () => {
    it('creates a registry with default provider strategies', () => {
      const registry = CostRegistry.default();
      expect(registry.hasProvider('anthropic')).toBe(true);
      expect(registry.hasProvider('openai')).toBe(true);
      expect(registry.hasProvider('minimax')).toBe(true);
      const providers = registry.listProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('minimax');
    });
  });

  describe('calculate()', () => {
    const registry = CostRegistry.default();

    it('calculates cost for claude-haiku-3-5', () => {
      const result = registry.calculate({
        source: 'llm',
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        usage: { inputTokens: 1000, outputTokens: 100 },
      });

      // claude-haiku-3-5: $0.80/1M input, $4.00/1M output
      expect(result.inputCost).toBeCloseTo(0.0008);
      expect(result.outputCost).toBeCloseTo(0.0004);
      expect(result.totalCost).toBeCloseTo(0.0012);
      expect(result.currency).toBe('USD');
    });

    it('calculates cost for gpt-4o-mini', () => {
      const result = registry.calculate({
        source: 'llm',
        provider: 'openai',
        model: 'gpt-4o-mini',
        usage: { inputTokens: 10000, outputTokens: 1000 },
      });

      // gpt-4o-mini: $0.15/1M input, $0.60/1M output
      expect(result.inputCost).toBeCloseTo(0.0015);
      expect(result.outputCost).toBeCloseTo(0.0006);
      expect(result.totalCost).toBeCloseTo(0.0021);
    });

    it('handles cache tokens for anthropic', () => {
      const result = registry.calculate({
        source: 'llm',
        provider: 'anthropic',
        model: 'claude-haiku-3-5',
        usage: {
          inputTokens: 1000,
          outputTokens: 100,
          cacheCreationTokens: 500,
          cacheReadTokens: 200,
        },
      });

      // claude-haiku-3-5: cache write $1.00/1M, cache read $0.08/1M
      expect(result.cacheWriteCost).toBeCloseTo(0.0005);
      expect(result.cacheReadCost).toBeCloseTo(0.000016);
    });

    it('returns zero cost for unknown provider', () => {
      const result = registry.calculate({
        source: 'llm',
        provider: 'unknown',
        model: 'some-model',
        usage: { inputTokens: 1000, outputTokens: 100 },
      });

      expect(result.totalCost).toBe(0);
    });

    it('returns zero cost for unknown model', () => {
      const result = registry.calculate({
        source: 'llm',
        provider: 'anthropic',
        model: 'unknown-model-xyz',
        usage: { inputTokens: 1000, outputTokens: 100 },
      });

      expect(result.totalCost).toBe(0);
    });
  });

  describe('calculateLLM()', () => {
    it('is a shorthand for calculate with source: llm', () => {
      const registry = CostRegistry.default();
      const result = registry.calculateLLM('anthropic', 'claude-haiku-3-5', {
        inputTokens: 1000,
        outputTokens: 100,
      });

      expect(result.inputCost).toBeCloseTo(0.0008);
      expect(result.outputCost).toBeCloseTo(0.0004);
    });
  });

  describe('registerRate()', () => {
    it('allows registering custom rates for non-LLM sources', () => {
      const registry = CostRegistry.empty();
      registry.registerRate({
        source: 'api',
        provider: 'weather-api',
        ratePerCall: 0.001,
      });

      const result = registry.calculate({
        source: 'api',
        provider: 'weather-api',
        model: '',
        usage: { inputTokens: 0, outputTokens: 0 },
      });

      expect(result.totalCost).toBe(0.001);
    });

    it('calculates cost with ratePerUnit', () => {
      const registry = CostRegistry.empty();
      registry.registerRate({
        source: 'database',
        provider: 'neon',
        ratePerUnit: 0.0001, // per operation
      });

      const result = registry.calculate({
        source: 'database',
        provider: 'neon',
        model: '',
        usage: { inputTokens: 50, outputTokens: 50 }, // 100 total units
      });

      expect(result.totalCost).toBeCloseTo(0.01); // 100 * 0.0001
    });

    it('returns zero cost when no rate registered', () => {
      const registry = CostRegistry.empty();

      const result = registry.calculate({
        source: 'api',
        provider: 'unregistered-api',
        model: '',
        usage: { inputTokens: 100, outputTokens: 100 },
      });

      expect(result.totalCost).toBe(0);
    });

    it('registers rate with model specified', () => {
      const registry = CostRegistry.empty();
      registry.registerRate({
        source: 'compute',
        provider: 'aws',
        model: 'lambda',
        ratePerCall: 0.0002,
      });

      const result = registry.calculate({
        source: 'compute',
        provider: 'aws',
        model: 'lambda',
        usage: { inputTokens: 0, outputTokens: 0 },
      });

      expect(result.totalCost).toBe(0.0002);
    });
  });

  describe('getStrategy()', () => {
    it('returns strategy for known provider', () => {
      const registry = CostRegistry.default();
      const strategy = registry.getStrategy('anthropic');

      expect(strategy).toBeDefined();
      expect(strategy?.provider).toBe('anthropic');
    });

    it('returns undefined for unknown provider', () => {
      const registry = CostRegistry.default();
      const strategy = registry.getStrategy('unknown-provider');

      expect(strategy).toBeUndefined();
    });
  });

  describe('registerStrategy()', () => {
    it('allows registering custom provider strategies', () => {
      const registry = CostRegistry.empty();

      registry.registerStrategy({
        provider: 'custom-llm',
        getPricing: (modelId) => {
          if (modelId === 'custom-model') {
            return { inputPer1M: 1.0, outputPer1M: 2.0 };
          }
          return undefined;
        },
        calculateCost: (modelId, usage) => ({
          inputCost: (usage.inputTokens / 1_000_000) * 1.0,
          outputCost: (usage.outputTokens / 1_000_000) * 2.0,
          cachedInputCost: 0,
          cacheWriteCost: 0,
          cacheReadCost: 0,
          totalCost: (usage.inputTokens / 1_000_000) * 1.0 + (usage.outputTokens / 1_000_000) * 2.0,
          currency: 'USD',
        }),
        listModels: () => ['custom-model'],
        hasModel: (modelId) => modelId === 'custom-model',
      });

      expect(registry.hasProvider('custom-llm')).toBe(true);

      const result = registry.calculateLLM('custom-llm', 'custom-model', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      });

      expect(result.inputCost).toBe(1.0);
      expect(result.outputCost).toBe(1.0);
      expect(result.totalCost).toBe(2.0);
    });
  });

  describe('empty()', () => {
    it('creates an empty registry with no providers', () => {
      const registry = CostRegistry.empty();

      expect(registry.listProviders()).toEqual([]);
      expect(registry.hasProvider('anthropic')).toBe(false);
      expect(registry.hasProvider('openai')).toBe(false);
    });
  });
});
