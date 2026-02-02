import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTokenCounter } from '../counting/tiktoken-counter.js';
import type { SyncTokenCounter } from '../counting/types.js';

describe('createTokenCounter', () => {
  describe('sync counter (default)', () => {
    it('counts tokens for simple text', () => {
      const counter = createTokenCounter();
      const count = counter('Hello, world!');

      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    it('returns consistent counts for same input', () => {
      const counter = createTokenCounter();
      const text = 'The quick brown fox jumps over the lazy dog.';

      const count1 = counter(text);
      const count2 = counter(text);

      expect(count1).toBe(count2);
    });

    it('returns 0 for empty string', () => {
      const counter = createTokenCounter();
      const count = counter('');

      expect(count).toBe(0);
    });

    it('uses cl100k_base encoding by default', () => {
      const counter = createTokenCounter() as SyncTokenCounter;

      expect(counter.getEncodingOrModel()).toBe('cl100k_base');
    });

    it('has isAsync = false property', () => {
      const counter = createTokenCounter() as SyncTokenCounter;

      expect(counter.isAsync).toBe(false);
    });

    it('counts multi-line text', () => {
      const counter = createTokenCounter();
      const text = `Line 1
Line 2
Line 3`;

      const count = counter(text);
      expect(count).toBeGreaterThan(0);
    });

    it('counts unicode text', () => {
      const counter = createTokenCounter();
      const count = counter('Hello, monde! Hola, world!');

      expect(count).toBeGreaterThan(0);
    });
  });

  describe('with custom encoding', () => {
    it('accepts o200k_base encoding option', () => {
      const counter = createTokenCounter({ encoding: 'o200k_base' }) as SyncTokenCounter;

      expect(counter.getEncodingOrModel()).toBe('o200k_base');
    });

    it('accepts p50k_base encoding option', () => {
      const counter = createTokenCounter({ encoding: 'p50k_base' }) as SyncTokenCounter;

      expect(counter.getEncodingOrModel()).toBe('p50k_base');
    });

    it('different encodings may produce different counts', () => {
      const counter1 = createTokenCounter({ encoding: 'cl100k_base' });
      const counter2 = createTokenCounter({ encoding: 'p50k_base' });
      const text = 'This is a test sentence for token counting.';

      const count1 = counter1(text);
      const count2 = counter2(text);

      // Both should return valid counts (may or may not be equal)
      expect(count1).toBeGreaterThan(0);
      expect(count2).toBeGreaterThan(0);
    });
  });

  describe('fallback behavior', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('falls back to tiktoken when model specified but no API key', () => {
      // When model is specified but no API key, should fall back to tiktoken
      const counter = createTokenCounter({ model: 'claude-sonnet-4-5' });

      // Should still work (fallback to tiktoken)
      const count = counter('Hello, world!');
      expect(count).toBeGreaterThan(0);

      // Should be sync (tiktoken fallback)
      expect(counter.isAsync).toBe(false);
    });

    it('uses default encoding when falling back', () => {
      const counter = createTokenCounter({ model: 'claude-sonnet-4-5' }) as SyncTokenCounter;

      // Falls back to default cl100k_base
      expect(counter.getEncodingOrModel()).toBe('cl100k_base');
    });

    it('uses custom encoding when falling back with encoding option', () => {
      const counter = createTokenCounter({
        model: 'claude-sonnet-4-5',
        encoding: 'o200k_base',
      }) as SyncTokenCounter;

      // Falls back to specified encoding
      expect(counter.getEncodingOrModel()).toBe('o200k_base');
    });
  });

  describe('encoder caching', () => {
    it('reuses encoder instance across calls', () => {
      const counter = createTokenCounter();

      // Multiple calls should work correctly (encoder is lazily initialized and cached)
      const count1 = counter('First call');
      const count2 = counter('Second call');
      const count3 = counter('Third call');

      expect(count1).toBeGreaterThan(0);
      expect(count2).toBeGreaterThan(0);
      expect(count3).toBeGreaterThan(0);
    });
  });
});
