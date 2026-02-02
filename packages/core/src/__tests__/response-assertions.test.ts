/**
 * Tests for response assertions
 */
import { describe, it, expect } from 'vitest';

import { assertResponse } from '../assertions/response.js';

describe('Response Assertions', () => {
  describe('mentions (AND logic)', () => {
    it('passes when all keywords are present', () => {
      const result = assertResponse('I created your task for groceries', {
        mentions: ['task', 'groceries'],
      });
      expect(result.passed).toBe(true);
    });

    it('fails when any keyword is missing', () => {
      const result = assertResponse('I created your item for groceries', {
        mentions: ['task', 'groceries'],
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('task');
    });

    it('is case-insensitive', () => {
      const result = assertResponse('TASK created', {
        mentions: ['task'],
      });
      expect(result.passed).toBe(true);
    });

    it('uses word boundaries', () => {
      const result = assertResponse('tasking is fun', {
        mentions: ['task'],
      });
      expect(result.passed).toBe(false);
    });
  });

  describe('mentionsAny (OR logic)', () => {
    it('passes when first keyword matches', () => {
      const result = assertResponse('I created your grocery shopping task', {
        mentionsAny: ['groceries', 'grocery', 'supermarket'],
      });
      expect(result.passed).toBe(true);
    });

    it('passes when any keyword matches', () => {
      const result = assertResponse('Go to the supermarket', {
        mentionsAny: ['groceries', 'grocery', 'supermarket'],
      });
      expect(result.passed).toBe(true);
    });

    it('fails when no keywords match', () => {
      const result = assertResponse('I created your shopping task', {
        mentionsAny: ['groceries', 'grocery', 'supermarket'],
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('does not mention any of');
    });

    it('is case-insensitive', () => {
      const result = assertResponse('GROCERIES are on the list', {
        mentionsAny: ['groceries'],
      });
      expect(result.passed).toBe(true);
    });

    it('uses word boundaries', () => {
      const result = assertResponse('grocery shopping is fun', {
        mentionsAny: ['groceries'],
      });
      // "grocery" != "groceries" due to word boundary
      expect(result.passed).toBe(false);
    });

    it('matches exact word with word boundaries', () => {
      const result = assertResponse('grocery shopping is fun', {
        mentionsAny: ['grocery'],
      });
      expect(result.passed).toBe(true);
    });
  });

  describe('notMentions', () => {
    it('passes when keyword is absent', () => {
      const result = assertResponse('I created your item', {
        notMentions: ['error'],
      });
      expect(result.passed).toBe(true);
    });

    it('fails when keyword is present', () => {
      const result = assertResponse('An error occurred', {
        notMentions: ['error'],
      });
      expect(result.passed).toBe(false);
    });
  });

  describe('contains (case-sensitive)', () => {
    it('passes when substring is present', () => {
      const result = assertResponse('Your task is ready', {
        contains: 'task is',
      });
      expect(result.passed).toBe(true);
    });

    it('fails when substring is missing', () => {
      const result = assertResponse('Your item is ready', {
        contains: 'task is',
      });
      expect(result.passed).toBe(false);
    });

    it('is case-sensitive', () => {
      const result = assertResponse('Your TASK is ready', {
        contains: 'task',
      });
      expect(result.passed).toBe(false);
    });
  });

  describe('containsAny (OR logic, case-insensitive)', () => {
    it('passes when substring matches', () => {
      const result = assertResponse('Your grocery shopping list', {
        containsAny: ['grocer', 'market'],
      });
      expect(result.passed).toBe(true);
    });

    it('is case-insensitive', () => {
      const result = assertResponse('GROCERY shopping', {
        containsAny: ['grocery'],
      });
      expect(result.passed).toBe(true);
    });

    it('fails when no substrings match', () => {
      const result = assertResponse('Shopping list created', {
        containsAny: ['grocer', 'market'],
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('does not contain any of');
    });

    it('matches partial words (substring match)', () => {
      const result = assertResponse('groceries at the supermarket', {
        containsAny: ['grocer'],
      });
      expect(result.passed).toBe(true);
    });
  });

  describe('matches (regex)', () => {
    it('passes when regex matches', () => {
      const result = assertResponse('Task #123 created', {
        matches: 'Task #\\d+',
      });
      expect(result.passed).toBe(true);
    });

    it('fails when regex does not match', () => {
      const result = assertResponse('Item created', {
        matches: 'Task #\\d+',
      });
      expect(result.passed).toBe(false);
    });

    it('is case-insensitive', () => {
      const result = assertResponse('TASK created', {
        matches: 'task',
      });
      expect(result.passed).toBe(true);
    });
  });

  describe('combined assertions', () => {
    it('requires both mentions AND mentionsAny to pass', () => {
      const result = assertResponse('I created your task at the supermarket', {
        mentions: ['task'],
        mentionsAny: ['groceries', 'grocery', 'supermarket'],
      });
      expect(result.passed).toBe(true);
    });

    it('fails if mentions passes but mentionsAny fails', () => {
      const result = assertResponse('I created your task', {
        mentions: ['task'],
        mentionsAny: ['groceries', 'grocery', 'supermarket'],
      });
      expect(result.passed).toBe(false);
    });

    it('fails if mentionsAny passes but mentions fails', () => {
      const result = assertResponse('I created groceries', {
        mentions: ['task'],
        mentionsAny: ['groceries', 'grocery', 'supermarket'],
      });
      expect(result.passed).toBe(false);
    });

    it('requires all combined assertions to pass', () => {
      const result = assertResponse('Your grocery task is ready', {
        mentions: ['task'],
        mentionsAny: ['grocery', 'groceries'],
        notMentions: ['error'],
        matches: 'ready$',
      });
      expect(result.passed).toBe(true);
    });

    it('fails if any combined assertion fails', () => {
      const result = assertResponse('Your grocery task had an error', {
        mentions: ['task'],
        mentionsAny: ['grocery', 'groceries'],
        notMentions: ['error'],
      });
      expect(result.passed).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('passes with no assertions specified', () => {
      const result = assertResponse('Any response', {});
      expect(result.passed).toBe(true);
    });

    it('handles empty response text', () => {
      const result = assertResponse('', {
        mentionsAny: ['task'],
      });
      expect(result.passed).toBe(false);
    });

    it('handles single-item mentionsAny', () => {
      const result = assertResponse('Task created', {
        mentionsAny: ['task'],
      });
      expect(result.passed).toBe(true);
    });

    it('handles special regex characters in mentions', () => {
      const result = assertResponse('Price is $50', {
        mentionsAny: ['$50', 'price'],
      });
      expect(result.passed).toBe(true);
    });
  });
});
