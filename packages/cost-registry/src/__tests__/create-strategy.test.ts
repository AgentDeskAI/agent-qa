import { describe, it, expect } from 'vitest';
import { createPricingStrategy } from '../rates/create-strategy.js';
import type { ProviderPricing, TokenUsage } from '../types.js';

describe('createPricingStrategy', () => {
  // Test catalog with known pricing
  const testCatalog: ProviderPricing = {
    'model-a': {
      inputPer1M: 1.0,
      outputPer1M: 2.0,
      displayName: 'Model A',
    },
    'model-b': {
      inputPer1M: 0.5,
      outputPer1M: 1.0,
      cachedInputPer1M: 0.1,
      displayName: 'Model B',
    },
    'model-c': {
      inputPer1M: 2.0,
      outputPer1M: 4.0,
      cacheWritePer1M: 2.5,
      cacheReadPer1M: 0.2,
      displayName: 'Model C',
    },
  };

  const testAliases: Record<string, string> = {
    'model-a-latest': 'model-a',
    'model-a-20250101': 'model-a',
    'alias-b': 'model-b',
  };

  const strategy = createPricingStrategy({
    provider: 'test-provider',
    catalog: testCatalog,
    aliases: testAliases,
  });

  describe('provider property', () => {
    it('returns the provider name', () => {
      expect(strategy.provider).toBe('test-provider');
    });
  });

  describe('getPricing', () => {
    it('returns pricing for direct model match', () => {
      const pricing = strategy.getPricing('model-a');

      expect(pricing).toBeDefined();
      expect(pricing?.inputPer1M).toBe(1.0);
      expect(pricing?.outputPer1M).toBe(2.0);
    });

    it('returns pricing for aliased model', () => {
      const pricing = strategy.getPricing('model-a-latest');

      expect(pricing).toBeDefined();
      expect(pricing?.inputPer1M).toBe(1.0);
      expect(pricing?.outputPer1M).toBe(2.0);
    });

    it('returns pricing for another alias', () => {
      const pricing = strategy.getPricing('alias-b');

      expect(pricing).toBeDefined();
      expect(pricing?.inputPer1M).toBe(0.5);
    });

    it('returns pricing for partial match (model contains catalog key)', () => {
      // 'my-model-a-custom' contains 'model-a'
      const pricing = strategy.getPricing('my-model-a-custom');

      expect(pricing).toBeDefined();
      expect(pricing?.inputPer1M).toBe(1.0);
    });

    it('returns pricing for partial match (catalog key contains model)', () => {
      // 'model' is contained in 'model-a'
      const pricing = strategy.getPricing('model');

      expect(pricing).toBeDefined();
    });

    it('returns undefined for unknown model', () => {
      const pricing = strategy.getPricing('completely-unknown-model-xyz');

      expect(pricing).toBeUndefined();
    });
  });

  describe('calculateCost', () => {
    it('calculates basic input/output costs', () => {
      const usage: TokenUsage = {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      };

      const result = strategy.calculateCost('model-a', usage);

      expect(result.inputCost).toBe(1.0); // 1M tokens * $1/1M
      expect(result.outputCost).toBe(1.0); // 0.5M tokens * $2/1M
      expect(result.totalCost).toBe(2.0);
      expect(result.currency).toBe('USD');
    });

    it('calculates cost with fractional tokens', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 100,
      };

      const result = strategy.calculateCost('model-a', usage);

      expect(result.inputCost).toBeCloseTo(0.001); // 1000/1M * $1
      expect(result.outputCost).toBeCloseTo(0.0002); // 100/1M * $2
      expect(result.totalCost).toBeCloseTo(0.0012);
    });

    it('handles cacheCreationTokens and cacheReadTokens', () => {
      const usage: TokenUsage = {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cacheCreationTokens: 100_000,
        cacheReadTokens: 200_000,
      };

      const result = strategy.calculateCost('model-c', usage);

      expect(result.inputCost).toBe(2.0); // 1M * $2/1M
      expect(result.outputCost).toBe(2.0); // 0.5M * $4/1M
      expect(result.cacheWriteCost).toBeCloseTo(0.25); // 0.1M * $2.5/1M
      expect(result.cacheReadCost).toBeCloseTo(0.04); // 0.2M * $0.2/1M
      expect(result.totalCost).toBeCloseTo(4.29);
    });

    it('handles legacy cachedInputTokens', () => {
      const usage: TokenUsage = {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cachedInputTokens: 300_000,
      };

      const result = strategy.calculateCost('model-b', usage);

      expect(result.inputCost).toBe(0.5); // 1M * $0.5/1M
      expect(result.outputCost).toBe(0.5); // 0.5M * $1/1M
      expect(result.cachedInputCost).toBeCloseTo(0.03); // 0.3M * $0.1/1M
      expect(result.totalCost).toBeCloseTo(1.03);
    });

    it('returns zero cost for unknown model', () => {
      const usage: TokenUsage = {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      };

      const result = strategy.calculateCost('unknown-model-xyz', usage);

      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('returns zero cache costs when no cache pricing defined', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 100,
        cacheCreationTokens: 500,
        cacheReadTokens: 200,
      };

      // model-a has no cache pricing
      const result = strategy.calculateCost('model-a', usage);

      expect(result.cacheWriteCost).toBe(0);
      expect(result.cacheReadCost).toBe(0);
    });

    it('returns zero cachedInputCost when no cachedInputPer1M defined', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 100,
        cachedInputTokens: 500,
      };

      // model-a has no cachedInputPer1M
      const result = strategy.calculateCost('model-a', usage);

      expect(result.cachedInputCost).toBe(0);
    });

    it('prioritizes new cache breakdown over legacy cachedInputTokens', () => {
      const usage: TokenUsage = {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cachedInputTokens: 100_000, // Legacy field
        cacheCreationTokens: 50_000, // New field
        cacheReadTokens: 30_000, // New field
      };

      const result = strategy.calculateCost('model-c', usage);

      // Should use new cache breakdown, not legacy
      expect(result.cacheWriteCost).toBeCloseTo(0.125); // 0.05M * $2.5/1M
      expect(result.cacheReadCost).toBeCloseTo(0.006); // 0.03M * $0.2/1M
      // cachedInputCost should be sum of write + read for backwards compat
      expect(result.cachedInputCost).toBeCloseTo(0.131);
    });
  });

  describe('listModels', () => {
    it('returns all model IDs from catalog', () => {
      const models = strategy.listModels();

      expect(models).toContain('model-a');
      expect(models).toContain('model-b');
      expect(models).toContain('model-c');
      expect(models).toHaveLength(3);
    });

    it('does not include aliases', () => {
      const models = strategy.listModels();

      expect(models).not.toContain('model-a-latest');
      expect(models).not.toContain('alias-b');
    });
  });

  describe('hasModel', () => {
    it('returns true for known model', () => {
      expect(strategy.hasModel('model-a')).toBe(true);
      expect(strategy.hasModel('model-b')).toBe(true);
    });

    it('returns true for aliased model', () => {
      expect(strategy.hasModel('model-a-latest')).toBe(true);
      expect(strategy.hasModel('alias-b')).toBe(true);
    });

    it('returns true for partial match', () => {
      expect(strategy.hasModel('my-model-a-custom')).toBe(true);
    });

    it('returns false for unknown model', () => {
      expect(strategy.hasModel('completely-unknown-xyz')).toBe(false);
    });
  });

  describe('strategy without aliases', () => {
    const strategyNoAliases = createPricingStrategy({
      provider: 'simple-provider',
      catalog: {
        'simple-model': {
          inputPer1M: 1.0,
          outputPer1M: 2.0,
        },
      },
    });

    it('works without aliases', () => {
      const pricing = strategyNoAliases.getPricing('simple-model');
      expect(pricing).toBeDefined();
      expect(pricing?.inputPer1M).toBe(1.0);
    });

    it('returns undefined for non-matching model without aliases', () => {
      const pricing = strategyNoAliases.getPricing('other-model');
      expect(pricing).toBeUndefined();
    });
  });
});
