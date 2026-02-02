/**
 * Tests for tool call assertions
 */
import { describe, it, expect } from 'vitest';

import { assertToolCalls, assertTotalToolCalls, countToolCalls } from '../assertions/tool.js';
import type { ToolCall } from '../assertions/types.js';

describe('Tool Assertions', () => {
  const mockToolCalls: ToolCall[] = [
    { name: 'manageTasks', args: { action: 'create', title: 'Test' } },
    { name: 'manageTasks', args: { action: 'list' } },
    { name: 'searchWeb', args: { query: 'test' } },
  ];

  describe('countToolCalls', () => {
    it('should count total tool calls', () => {
      expect(countToolCalls(mockToolCalls)).toBe(3);
      expect(countToolCalls([])).toBe(0);
    });
  });

  describe('assertTotalToolCalls', () => {
    it('should pass with exact count', () => {
      const result = assertTotalToolCalls(mockToolCalls, 3);
      expect(result.passed).toBe(true);
    });

    it('should fail with wrong count', () => {
      const result = assertTotalToolCalls(mockToolCalls, 5);
      expect(result.passed).toBe(false);
    });

    it('should pass with min constraint', () => {
      const result = assertTotalToolCalls(mockToolCalls, { min: 2 });
      expect(result.passed).toBe(true);
    });

    it('should fail with min constraint', () => {
      const result = assertTotalToolCalls(mockToolCalls, { min: 5 });
      expect(result.passed).toBe(false);
    });

    it('should pass with max constraint', () => {
      const result = assertTotalToolCalls(mockToolCalls, { max: 5 });
      expect(result.passed).toBe(true);
    });

    it('should fail with max constraint', () => {
      const result = assertTotalToolCalls(mockToolCalls, { max: 2 });
      expect(result.passed).toBe(false);
    });

    it('should pass with range constraint', () => {
      const result = assertTotalToolCalls(mockToolCalls, { min: 2, max: 5 });
      expect(result.passed).toBe(true);
    });
  });

  describe('assertToolCalls', () => {
    it('should pass with simple count assertion', () => {
      const result = assertToolCalls(mockToolCalls, { manageTasks: 2 });
      expect(result.passed).toBe(true);
    });

    it('should fail with wrong count', () => {
      const result = assertToolCalls(mockToolCalls, { manageTasks: 1 });
      expect(result.passed).toBe(false);
    });

    it('should pass with min/max assertion', () => {
      const result = assertToolCalls(mockToolCalls, {
        manageTasks: { count: { min: 1, max: 3 } },
      });
      expect(result.passed).toBe(true);
    });

    it('should pass with notCalled assertion (array format)', () => {
      // notCalled requires the full ToolAssertion[] format
      const result = assertToolCalls(mockToolCalls, [
        { name: 'nonexistent', notCalled: true },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail when notCalled tool was called (array format)', () => {
      // notCalled requires the full ToolAssertion[] format
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', notCalled: true },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should pass with multiple tool assertions', () => {
      const result = assertToolCalls(mockToolCalls, {
        manageTasks: 2,
        searchWeb: 1,
      });
      expect(result.passed).toBe(true);
    });

    it('should fail if any assertion fails', () => {
      const result = assertToolCalls(mockToolCalls, {
        manageTasks: 2,
        searchWeb: 5, // Wrong count
      });
      expect(result.passed).toBe(false);
    });
  });

  // ===========================================================================
  // Additional tests for full coverage
  // ===========================================================================

  describe('assertToolCalls - simple format min/max', () => {
    it('should pass with min constraint in simple format', () => {
      const result = assertToolCalls(mockToolCalls, {
        manageTasks: { min: 1 },
      });
      expect(result.passed).toBe(true);
    });

    it('should fail min constraint in simple format', () => {
      const result = assertToolCalls(mockToolCalls, {
        manageTasks: { min: 5 },
      });
      expect(result.passed).toBe(false);
    });

    it('should pass with max constraint in simple format', () => {
      const result = assertToolCalls(mockToolCalls, {
        manageTasks: { max: 5 },
      });
      expect(result.passed).toBe(true);
    });

    it('should fail max constraint in simple format', () => {
      const result = assertToolCalls(mockToolCalls, {
        manageTasks: { max: 1 },
      });
      expect(result.passed).toBe(false);
    });
  });

  describe('assertToolCalls - full format', () => {
    it('should pass with exact count in full format', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', count: 2 },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail with wrong exact count in full format', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', count: 5 },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should pass with count range in full format', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', count: { min: 1, max: 5 } },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail min count range in full format', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', count: { min: 10 } },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should fail max count range in full format', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', count: { max: 1 } },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should pass when no count requirement and no calls', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'nonexistent' },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail when input assertion but no calls', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'nonexistent', input: { field: 'value' } },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should fail when output assertion but no calls', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'nonexistent', output: { field: 'value' } },
      ]);
      expect(result.passed).toBe(false);
    });
  });

  describe('assertToolCalls - input assertions', () => {
    const singleToolCall: ToolCall[] = [
      { name: 'createTask', args: { title: 'Buy groceries', priority: 'high' } },
    ];

    const multipleToolCalls: ToolCall[] = [
      { name: 'createTask', args: { title: 'Buy groceries', priority: 'high' } },
      { name: 'createTask', args: { title: 'Clean house', priority: 'low' } },
    ];

    it('should pass when input matches single call', () => {
      const result = assertToolCalls(singleToolCall, [
        { name: 'createTask', input: { title: 'Buy groceries' } },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail when input does not match', () => {
      const result = assertToolCalls(singleToolCall, [
        { name: 'createTask', input: { title: 'Wrong title' } },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should check input on all matching calls', () => {
      // Both calls should have 'high' priority for this to pass
      const result = assertToolCalls(multipleToolCalls, [
        { name: 'createTask', input: { priority: 'high' } },
      ]);
      // This should fail because second call has 'low'
      expect(result.passed).toBe(false);
    });

    it('should pass input with matcher on single call', () => {
      const result = assertToolCalls(singleToolCall, [
        { name: 'createTask', input: { title: { contains: 'groceries' } } },
      ]);
      expect(result.passed).toBe(true);
    });
  });

  describe('assertToolCalls - output assertions', () => {
    const toolCallsWithResults: ToolCall[] = [
      {
        name: 'createTask',
        args: { title: 'Test' },
        result: { id: 'task-123', status: 'created' },
      },
    ];

    it('should pass when output matches', () => {
      const result = assertToolCalls(toolCallsWithResults, [
        { name: 'createTask', output: { status: 'created' } },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail when output does not match', () => {
      const result = assertToolCalls(toolCallsWithResults, [
        { name: 'createTask', output: { status: 'failed' } },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should fail when no result available', () => {
      const callsWithoutResult: ToolCall[] = [
        { name: 'createTask', args: { title: 'Test' } },
      ];
      const result = assertToolCalls(callsWithoutResult, [
        { name: 'createTask', output: { id: 'task-123' } },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should fail when result is not an object', () => {
      const callsWithNonObjectResult: ToolCall[] = [
        { name: 'createTask', args: { title: 'Test' }, result: 'success' },
      ];
      const result = assertToolCalls(callsWithNonObjectResult, [
        { name: 'createTask', output: { status: 'success' } },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should pass output with matcher', () => {
      const result = assertToolCalls(toolCallsWithResults, [
        { name: 'createTask', output: { id: { matches: '^task-' } } },
      ]);
      expect(result.passed).toBe(true);
    });
  });

  describe('assertToolCalls - combined input and output', () => {
    const fullToolCalls: ToolCall[] = [
      {
        name: 'createTask',
        args: { title: 'Important task', priority: 'high' },
        result: { id: 'task-456', created: true },
      },
    ];

    it('should pass when both input and output match', () => {
      const result = assertToolCalls(fullToolCalls, [
        {
          name: 'createTask',
          input: { title: 'Important task' },
          output: { created: true },
        },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail when input matches but output fails', () => {
      const result = assertToolCalls(fullToolCalls, [
        {
          name: 'createTask',
          input: { title: 'Important task' },
          output: { created: false },
        },
      ]);
      expect(result.passed).toBe(false);
    });

    it('should fail when output matches but input fails', () => {
      const result = assertToolCalls(fullToolCalls, [
        {
          name: 'createTask',
          input: { title: 'Wrong title' },
          output: { created: true },
        },
      ]);
      expect(result.passed).toBe(false);
    });
  });

  describe('assertToolCalls - multiple assertions', () => {
    it('should pass when all assertions pass', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', count: 2 },
        { name: 'searchWeb', count: 1 },
      ]);
      expect(result.passed).toBe(true);
    });

    it('should fail when any assertion fails', () => {
      const result = assertToolCalls(mockToolCalls, [
        { name: 'manageTasks', count: 2 },
        { name: 'searchWeb', count: 5 }, // Wrong
      ]);
      expect(result.passed).toBe(false);
    });
  });
});
