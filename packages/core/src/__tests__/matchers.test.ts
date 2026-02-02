/**
 * Tests for field matchers
 */
import { describe, it, expect } from 'vitest';

import { matchField, matchFields } from '../assertions/matchers.js';

describe('Field Matchers', () => {
  describe('matchField', () => {
    it('should match exact string values', () => {
      const result = matchField('hello', 'hello');
      expect(result.passed).toBe(true);
    });

    it('should fail on string mismatch', () => {
      const result = matchField('hello', 'world');
      expect(result.passed).toBe(false);
    });

    it('should match exact number values', () => {
      const result = matchField(42, 42);
      expect(result.passed).toBe(true);
    });

    it('should match boolean values', () => {
      const result = matchField(true, true);
      expect(result.passed).toBe(true);
    });

    it('should match with contains matcher (string)', () => {
      const result = matchField('hello world', { contains: 'world' });
      expect(result.passed).toBe(true);
    });

    it('should match with contains matcher (array)', () => {
      const result = matchField('hello world', { contains: ['hello', 'world'] });
      expect(result.passed).toBe(true);
    });

    it('should fail contains when string not found', () => {
      const result = matchField('hello world', { contains: 'foo' });
      expect(result.passed).toBe(false);
    });

    it('should match with exists: true', () => {
      const result = matchField('anything', { exists: true });
      expect(result.passed).toBe(true);
    });

    it('should match with exists: false for undefined', () => {
      const result = matchField(undefined, { exists: false });
      expect(result.passed).toBe(true);
    });

    it('should fail exists: true for undefined', () => {
      const result = matchField(undefined, { exists: true });
      expect(result.passed).toBe(false);
    });

    it('should match with gt comparison', () => {
      const result = matchField(10, { gt: 5 });
      expect(result.passed).toBe(true);
    });

    it('should match with gte comparison', () => {
      const result = matchField(5, { gte: 5 });
      expect(result.passed).toBe(true);
    });

    it('should match with lt comparison', () => {
      const result = matchField(3, { lt: 5 });
      expect(result.passed).toBe(true);
    });

    it('should match with lte comparison', () => {
      const result = matchField(5, { lte: 5 });
      expect(result.passed).toBe(true);
    });

    it('should match with regex', () => {
      const result = matchField('hello123', { matches: '^hello\\d+$' });
      expect(result.passed).toBe(true);
    });

    it('should fail regex mismatch', () => {
      const result = matchField('hello', { matches: '^world' });
      expect(result.passed).toBe(false);
    });
  });

  describe('matchFields', () => {
    it('should match all fields', () => {
      const entity = { name: 'John', age: 30, active: true };
      const matchers = { name: 'John', age: 30, active: true };

      const result = matchFields(entity, matchers);
      expect(result.passed).toBe(true);
    });

    it('should fail if any field fails', () => {
      const entity = { name: 'John', age: 30 };
      const matchers = { name: 'John', age: 25 };

      const result = matchFields(entity, matchers);
      expect(result.passed).toBe(false);
    });

    it('should match with mixed matchers', () => {
      const entity = { name: 'John Doe', count: 10, status: 'active' };
      const matchers = {
        name: { contains: 'John' },
        count: { gt: 5 },
        status: 'active',
      };

      const result = matchFields(entity, matchers);
      expect(result.passed).toBe(true);
    });

    it('should pass with empty matchers', () => {
      const entity = { name: 'John' };
      const matchers = {};

      const result = matchFields(entity, matchers);
      expect(result.passed).toBe(true);
    });
  });

  // ===========================================================================
  // Additional matchField tests for coverage
  // ===========================================================================

  describe('matchField - containsAny', () => {
    it('should match string with containsAny (at least one match)', () => {
      const result = matchField('hello world', { containsAny: ['foo', 'world'] });
      expect(result.passed).toBe(true);
    });

    it('should fail string containsAny when none match', () => {
      const result = matchField('hello world', { containsAny: ['foo', 'bar'] });
      expect(result.passed).toBe(false);
    });

    it('should match array with containsAny', () => {
      const result = matchField(['a', 'b', 'c'], { containsAny: ['c', 'd'] });
      expect(result.passed).toBe(true);
    });

    it('should fail array containsAny when none match', () => {
      const result = matchField(['a', 'b', 'c'], { containsAny: ['x', 'y'] });
      expect(result.passed).toBe(false);
    });

    it('should be case-insensitive for string containsAny', () => {
      const result = matchField('Hello World', { containsAny: ['HELLO'] });
      expect(result.passed).toBe(true);
    });

    it('should fail containsAny on unsupported types', () => {
      const result = matchField(42, { containsAny: ['4'] });
      expect(result.passed).toBe(false);
    });
  });

  describe('matchField - array contains', () => {
    it('should match when array contains all elements', () => {
      const result = matchField(['a', 'b', 'c'], { contains: ['a', 'b'] });
      expect(result.passed).toBe(true);
    });

    it('should fail when array missing elements', () => {
      const result = matchField(['a', 'b'], { contains: ['c'] });
      expect(result.passed).toBe(false);
    });

    it('should fail contains on unsupported types', () => {
      const result = matchField(123, { contains: '1' });
      expect(result.passed).toBe(false);
    });
  });

  describe('matchField - comparison edge cases', () => {
    it('should coerce string numbers for comparison', () => {
      const result = matchField('10', { gt: 5 });
      expect(result.passed).toBe(true);
    });

    it('should fail gt comparison when equal', () => {
      const result = matchField(5, { gt: 5 });
      expect(result.passed).toBe(false);
    });

    it('should fail lt comparison when equal', () => {
      const result = matchField(5, { lt: 5 });
      expect(result.passed).toBe(false);
    });

    it('should fail comparison on non-numeric values', () => {
      const result = matchField('not a number', { gt: 5 });
      expect(result.passed).toBe(false);
    });

    it('should match combined comparison (range)', () => {
      const result = matchField(7, { gt: 5, lt: 10 });
      expect(result.passed).toBe(true);
    });
  });

  describe('matchField - exists edge cases', () => {
    it('should fail exists: false when value exists', () => {
      const result = matchField('some value', { exists: false });
      expect(result.passed).toBe(false);
    });

    it('should handle null as not existing', () => {
      const result = matchField(null, { exists: false });
      expect(result.passed).toBe(true);
    });
  });

  describe('matchField - regex edge cases', () => {
    it('should match regex with flags', () => {
      const result = matchField('HELLO', { matches: 'hello', flags: 'i' });
      expect(result.passed).toBe(true);
    });

    it('should fail regex on non-string values', () => {
      const result = matchField(123, { matches: '123' });
      expect(result.passed).toBe(false);
    });
  });

  describe('matchField - ref matchers', () => {
    it('should match ref with captured entities', () => {
      const context = {
        captured: {
          myStep: { id: 'task-123', title: 'Test Task' },
        },
      };
      const result = matchField('task-123', { from: 'myStep', field: 'id' }, context);
      expect(result.passed).toBe(true);
    });

    it('should default to id field for ref matcher', () => {
      const context = {
        captured: {
          myStep: { id: 'task-456', title: 'Test' },
        },
      };
      const result = matchField('task-456', { from: 'myStep' }, context);
      expect(result.passed).toBe(true);
    });

    it('should fail ref when value mismatch', () => {
      const context = {
        captured: {
          myStep: { id: 'task-123' },
        },
      };
      const result = matchField('wrong-id', { from: 'myStep', field: 'id' }, context);
      expect(result.passed).toBe(false);
    });

    it('should match ref from aliases', () => {
      const context = {
        aliases: new Map([['myAlias', { id: 'alias-id', type: 'task' }]]),
      };
      const result = matchField('alias-id', { from: 'myAlias', field: 'id' }, context);
      expect(result.passed).toBe(true);
    });

    it('should fail ref from alias when mismatch', () => {
      const context = {
        aliases: new Map([['myAlias', { id: 'correct-id', type: 'task' }]]),
      };
      const result = matchField('wrong-id', { from: 'myAlias', field: 'id' }, context);
      expect(result.passed).toBe(false);
    });

    it('should fail when accessing non-id field from alias', () => {
      const context = {
        aliases: new Map([['myAlias', { id: 'alias-id', type: 'task' }]]),
      };
      const result = matchField('some-value', { from: 'myAlias', field: 'title' }, context);
      expect(result.passed).toBe(false);
    });

    it('should match $userId reference', () => {
      const context = { userId: 'user-123' };
      const result = matchField('user-123', { from: 'userId' }, context);
      expect(result.passed).toBe(true);
    });

    it('should fail $userId reference when mismatch', () => {
      const context = { userId: 'user-123' };
      const result = matchField('user-456', { from: 'userId' }, context);
      expect(result.passed).toBe(false);
    });

    it('should fail for unknown reference', () => {
      const context = {};
      const result = matchField('some-value', { from: 'unknownAlias', field: 'id' }, context);
      expect(result.passed).toBe(false);
    });
  });

  describe('matchField - YAML ref format', () => {
    it('should match YAML ref format with $', () => {
      const context = {
        captured: {
          createTask: { id: 'task-789' },
        },
      };
      const result = matchField('task-789', { ref: '$createTask.id' }, context);
      expect(result.passed).toBe(true);
    });

    it('should match YAML ref format without $', () => {
      const context = {
        captured: {
          createTask: { id: 'task-789' },
        },
      };
      const result = matchField('task-789', { ref: 'createTask.id' }, context);
      expect(result.passed).toBe(true);
    });

    it('should fail YAML ref when not found', () => {
      const context = {};
      const result = matchField('some-value', { ref: '$unknownStep.id' }, context);
      expect(result.passed).toBe(false);
    });

    it('should fail YAML ref when value mismatch', () => {
      const context = {
        captured: {
          createTask: { id: 'task-correct' },
        },
      };
      const result = matchField('task-wrong', { ref: '$createTask.id' }, context);
      expect(result.passed).toBe(false);
    });

    it('should default to id field in YAML ref', () => {
      const context = {
        captured: {
          createTask: { id: 'task-default' },
        },
      };
      // When no field specified after alias, defaults to id
      const result = matchField('task-default', { ref: '$createTask' }, context);
      expect(result.passed).toBe(true);
    });
  });

  describe('matchField - null/undefined handling', () => {
    it('should handle null actual for exists: false', () => {
      const result = matchField(null, { exists: false });
      expect(result.passed).toBe(true);
    });

    it('should fail null actual for non-exists matcher', () => {
      const result = matchField(null, 'expected');
      expect(result.passed).toBe(false);
    });

    it('should fail undefined actual for literal matcher', () => {
      const result = matchField(undefined, 'expected');
      expect(result.passed).toBe(false);
    });
  });

  describe('matchField - type coercion', () => {
    it('should coerce numeric string to number', () => {
      const result = matchField('42', 42);
      expect(result.passed).toBe(true);
    });

    it('should coerce boolean string "true"', () => {
      const result = matchField('true', true);
      expect(result.passed).toBe(true);
    });

    it('should handle boolean string "false" coercion', () => {
      // 'false'.toLowerCase() === 'true' is false, so actualBool = false
      const result = matchField('false', false);
      expect(result.passed).toBe(true);
    });
  });
});
