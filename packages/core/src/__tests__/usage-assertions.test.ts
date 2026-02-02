/**
 * Tests for usage assertions
 */
import { describe, it, expect } from 'vitest';

import { assertUsage } from '../assertions/usage.js';

describe('Usage Assertions', () => {
  describe('basic field assertions', () => {
    it('passes when exact value matches', () => {
      const result = assertUsage(
        { inputTokens: 5000 },
        { inputTokens: 5000 }
      );
      expect(result.passed).toBe(true);
    });

    it('fails when exact value does not match', () => {
      const result = assertUsage(
        { inputTokens: 4999 },
        { inputTokens: 5000 }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('expected 5000, got 4999');
    });

    it('passes with gt matcher', () => {
      const result = assertUsage(
        { inputTokens: 1001 },
        { inputTokens: { gt: 1000 } }
      );
      expect(result.passed).toBe(true);
    });

    it('fails with gt matcher when value is equal', () => {
      const result = assertUsage(
        { inputTokens: 1000 },
        { inputTokens: { gt: 1000 } }
      );
      expect(result.passed).toBe(false);
    });

    it('fails with gt matcher when value is lower', () => {
      const result = assertUsage(
        { inputTokens: 999 },
        { inputTokens: { gt: 1000 } }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('expected > 1000');
    });

    it('passes with gte matcher when equal', () => {
      const result = assertUsage(
        { inputTokens: 1000 },
        { inputTokens: { gte: 1000 } }
      );
      expect(result.passed).toBe(true);
    });

    it('passes with lt matcher', () => {
      const result = assertUsage(
        { outputTokens: 999 },
        { outputTokens: { lt: 1000 } }
      );
      expect(result.passed).toBe(true);
    });

    it('fails with lt matcher when equal', () => {
      const result = assertUsage(
        { outputTokens: 1000 },
        { outputTokens: { lt: 1000 } }
      );
      expect(result.passed).toBe(false);
    });

    it('passes with lte matcher when equal', () => {
      const result = assertUsage(
        { outputTokens: 1000 },
        { outputTokens: { lte: 1000 } }
      );
      expect(result.passed).toBe(true);
    });

    it('passes with combined range', () => {
      const result = assertUsage(
        { totalTokens: 5000 },
        { totalTokens: { gt: 1000, lt: 10000 } }
      );
      expect(result.passed).toBe(true);
    });

    it('fails when value outside combined range', () => {
      const result = assertUsage(
        { totalTokens: 15000 },
        { totalTokens: { gt: 1000, lt: 10000 } }
      );
      expect(result.passed).toBe(false);
    });
  });

  describe('anyOf (OR logic)', () => {
    it('passes when first condition matches', () => {
      const result = assertUsage(
        { cacheCreationTokens: 100, cacheReadTokens: 0 },
        { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
      );
      expect(result.passed).toBe(true);
    });

    it('passes when second condition matches', () => {
      const result = assertUsage(
        { cacheCreationTokens: 0, cacheReadTokens: 100 },
        { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
      );
      expect(result.passed).toBe(true);
    });

    it('passes when both conditions match', () => {
      const result = assertUsage(
        { cacheCreationTokens: 50, cacheReadTokens: 100 },
        { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
      );
      expect(result.passed).toBe(true);
    });

    it('fails when no conditions match', () => {
      const result = assertUsage(
        { cacheCreationTokens: 0, cacheReadTokens: 0 },
        { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('anyOf failed');
      expect(result.message).toContain('none of 2 conditions passed');
    });

    it('handles empty array (no conditions to check)', () => {
      const result = assertUsage(
        { inputTokens: 100 },
        { anyOf: [] }
      );
      // Empty anyOf means no compound check is added, so passes with "No usage assertions"
      expect(result.passed).toBe(true);
    });

    it('works with single condition', () => {
      const result = assertUsage(
        { inputTokens: 100 },
        { anyOf: [{ inputTokens: { gt: 50 } }] }
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('allOf (explicit AND logic)', () => {
    it('passes when all conditions match', () => {
      const result = assertUsage(
        { inputTokens: 1000, outputTokens: 100 },
        { allOf: [{ inputTokens: { gt: 500 } }, { outputTokens: { lt: 200 } }] }
      );
      expect(result.passed).toBe(true);
    });

    it('fails when first condition fails', () => {
      const result = assertUsage(
        { inputTokens: 100, outputTokens: 100 },
        { allOf: [{ inputTokens: { gt: 500 } }, { outputTokens: { lt: 200 } }] }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('allOf failed');
      expect(result.message).toContain('1 of 2 conditions failed');
    });

    it('fails when second condition fails', () => {
      const result = assertUsage(
        { inputTokens: 1000, outputTokens: 300 },
        { allOf: [{ inputTokens: { gt: 500 } }, { outputTokens: { lt: 200 } }] }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('allOf failed');
    });

    it('fails when all conditions fail', () => {
      const result = assertUsage(
        { inputTokens: 100, outputTokens: 300 },
        { allOf: [{ inputTokens: { gt: 500 } }, { outputTokens: { lt: 200 } }] }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('2 of 2 conditions failed');
    });

    it('handles empty array (no conditions to check)', () => {
      const result = assertUsage(
        { inputTokens: 100 },
        { allOf: [] }
      );
      // Empty allOf means no compound check is added
      expect(result.passed).toBe(true);
    });

    it('works with single condition', () => {
      const result = assertUsage(
        { inputTokens: 100 },
        { allOf: [{ inputTokens: { gt: 50 } }] }
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('nested compounds', () => {
    it('supports anyOf containing allOf', () => {
      // Pass if: (inputTokens > 500 AND outputTokens < 200) OR (cacheReadTokens > 0)
      const result = assertUsage(
        { inputTokens: 100, outputTokens: 100, cacheReadTokens: 50 },
        {
          anyOf: [
            { allOf: [{ inputTokens: { gt: 500 } }, { outputTokens: { lt: 200 } }] },
            { cacheReadTokens: { gt: 0 } }
          ]
        }
      );
      expect(result.passed).toBe(true);
    });

    it('supports allOf containing anyOf', () => {
      // Pass if: inputTokens > 0 AND (cacheCreation > 0 OR cacheRead > 0)
      const result = assertUsage(
        { inputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 50 },
        {
          allOf: [
            { inputTokens: { gt: 0 } },
            { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
          ]
        }
      );
      expect(result.passed).toBe(true);
    });

    it('fails nested anyOf when outer allOf condition fails', () => {
      const result = assertUsage(
        { inputTokens: 0, cacheReadTokens: 50 },
        {
          allOf: [
            { inputTokens: { gt: 0 } },
            { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
          ]
        }
      );
      expect(result.passed).toBe(false);
    });
  });

  describe('combined with regular fields', () => {
    it('requires regular fields AND compound to pass', () => {
      const result = assertUsage(
        { inputTokens: 100, cacheReadTokens: 50 },
        {
          inputTokens: { gt: 0 },
          anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }]
        }
      );
      expect(result.passed).toBe(true);
    });

    it('fails when regular field fails even if compound passes', () => {
      const result = assertUsage(
        { inputTokens: 0, cacheReadTokens: 50 },
        {
          inputTokens: { gt: 0 },
          anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }]
        }
      );
      expect(result.passed).toBe(false);
    });

    it('fails when compound fails even if regular field passes', () => {
      const result = assertUsage(
        { inputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
        {
          inputTokens: { gt: 0 },
          anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }]
        }
      );
      expect(result.passed).toBe(false);
    });

    it('works with multiple regular fields and compound', () => {
      const result = assertUsage(
        { inputTokens: 100, outputTokens: 50, cacheReadTokens: 25 },
        {
          inputTokens: { gt: 0 },
          outputTokens: { lt: 100 },
          anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }]
        }
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles undefined usage data', () => {
      const result = assertUsage(
        undefined,
        { inputTokens: { gt: 0 } }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('No usage data available');
    });

    it('handles undefined field values', () => {
      const result = assertUsage(
        { outputTokens: 100 },  // inputTokens is undefined
        { inputTokens: { gt: 0 } }
      );
      expect(result.passed).toBe(false);
      expect(result.message).toContain('inputTokens: value is undefined');
    });

    it('passes with no assertions specified', () => {
      const result = assertUsage(
        { inputTokens: 100 },
        {}
      );
      expect(result.passed).toBe(true);
      expect(result.message).toContain('No usage assertions to check');
    });

    it('handles compound with undefined field in condition', () => {
      const result = assertUsage(
        { cacheReadTokens: 50 },  // cacheCreationTokens is undefined
        { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
      );
      // Second condition passes, so anyOf passes
      expect(result.passed).toBe(true);
    });

    it('fails compound when all conditions have undefined fields', () => {
      const result = assertUsage(
        { inputTokens: 100 },  // both cache fields are undefined
        { anyOf: [{ cacheCreationTokens: { gt: 0 } }, { cacheReadTokens: { gt: 0 } }] }
      );
      expect(result.passed).toBe(false);
    });
  });
});
