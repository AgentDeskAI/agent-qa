/**
 * Wait Assertions Tests
 *
 * These tests focus on the logic paths, not real timing behavior.
 * Sleep is mocked to make tests fast, and we control when conditions succeed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  waitFor,
  waitForEntity,
  waitForEntityCount,
  executeWaitCondition,
} from '../../assertions/wait.js';
import type { EntityQueryAdapter } from '../../assertions/entity.js';
import type { MatcherContext } from '../../assertions/matchers.js';
import type { EntityRow } from '../../assertions/types.js';
import type { WaitCondition } from '../../scenario/types.js';

// Mock the sleep function to make tests fast
vi.mock('../../helpers/utils.js', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createMockAdapter(overrides: Partial<EntityQueryAdapter> = {}): EntityQueryAdapter {
  return {
    findById: vi.fn().mockResolvedValue({ found: false, entity: null }),
    findByTitle: vi.fn().mockResolvedValue({ found: false, entity: null }),
    list: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createEntity(data: Partial<EntityRow> = {}): EntityRow {
  return {
    id: 'entity-1',
    title: 'Test Entity',
    status: 'pending',
    ...data,
  };
}

// =============================================================================
// waitFor Tests
// =============================================================================

describe('waitFor', () => {
  it('should resolve when condition is true immediately', async () => {
    const condition = vi.fn().mockResolvedValue({ success: true, value: 'test' });

    const result = await waitFor(condition, { timeoutMs: 5000, intervalMs: 100 });

    expect(result.success).toBe(true);
    expect(result.value).toBe('test');
    expect(result.attempts).toBe(1);
    expect(condition).toHaveBeenCalledTimes(1);
  });

  it('should resolve when condition becomes true after polling', async () => {
    const condition = vi.fn()
      .mockResolvedValueOnce({ success: false, message: 'not yet' })
      .mockResolvedValueOnce({ success: false, message: 'not yet' })
      .mockResolvedValueOnce({ success: true, value: 'found' });

    const result = await waitFor(condition, { timeoutMs: 5000, intervalMs: 100 });

    expect(result.success).toBe(true);
    expect(result.value).toBe('found');
    expect(result.attempts).toBe(3);
  });

  it('should call onPoll callback for each attempt', async () => {
    const onPoll = vi.fn();
    const condition = vi.fn()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });

    await waitFor(condition, { timeoutMs: 5000, intervalMs: 100, onPoll });

    expect(onPoll).toHaveBeenCalledTimes(3);
    expect(onPoll).toHaveBeenCalledWith(1);
    expect(onPoll).toHaveBeenCalledWith(2);
    expect(onPoll).toHaveBeenCalledWith(3);
  });

  it('should handle condition errors and retry', async () => {
    const condition = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true });

    const result = await waitFor(condition, { timeoutMs: 5000, intervalMs: 100 });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('should return custom success message', async () => {
    const condition = vi.fn().mockResolvedValue({ success: true, message: 'Custom message' });

    const result = await waitFor(condition, { timeoutMs: 5000, intervalMs: 100 });

    expect(result.message).toBe('Custom message');
  });

  it('should use default message when not provided', async () => {
    const condition = vi.fn().mockResolvedValue({ success: true });

    const result = await waitFor(condition, { timeoutMs: 5000, intervalMs: 100 });

    expect(result.message).toBe('Condition met');
  });
});

// =============================================================================
// waitForEntity Tests
// =============================================================================

describe('waitForEntity', () => {
  it('should resolve when entity appears with matching fields', async () => {
    const entity = createEntity({ status: 'completed' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const result = await waitForEntity(
      adapter,
      'tasks',
      { id: 'entity-1' },
      { status: 'completed' },
      { timeoutMs: 5000, intervalMs: 100 }
    );

    expect(result.passed).toBe(true);
    expect(result.entity).toBe(entity);
    expect(result.message).toContain('matched');
  });

  it('should poll until entity matches', async () => {
    const adapter = createMockAdapter({
      findById: vi.fn()
        .mockResolvedValueOnce({ found: true, entity: createEntity({ status: 'pending' }) })
        .mockResolvedValueOnce({ found: true, entity: createEntity({ status: 'pending' }) })
        .mockResolvedValueOnce({ found: true, entity: createEntity({ status: 'completed' }) }),
    });

    const result = await waitForEntity(
      adapter,
      'tasks',
      { id: 'entity-1' },
      { status: 'completed' },
      { timeoutMs: 5000, intervalMs: 100 }
    );

    expect(result.passed).toBe(true);
    expect(adapter.findById).toHaveBeenCalledTimes(3);
  });

  it('should find entity by title', async () => {
    const entity = createEntity();
    const adapter = createMockAdapter({
      findByTitle: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const result = await waitForEntity(
      adapter,
      'tasks',
      { title: 'Test Entity' },
      {},
      { timeoutMs: 5000, intervalMs: 100 }
    );

    expect(result.passed).toBe(true);
    expect(adapter.findByTitle).toHaveBeenCalledWith('tasks', 'Test Entity');
  });

  it('should pass context to field matching', async () => {
    const entity = createEntity({ listId: 'list-123' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      captured: { myList: { id: 'list-123' } },
    };

    const result = await waitForEntity(
      adapter,
      'tasks',
      { id: 'entity-1' },
      { listId: { from: 'myList', field: 'id' } },
      { timeoutMs: 5000, intervalMs: 100, context }
    );

    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// waitForEntityCount Tests
// =============================================================================

describe('waitForEntityCount', () => {
  it('should resolve when count reaches exact target', async () => {
    const adapter = createMockAdapter({
      list: vi.fn()
        .mockResolvedValueOnce([createEntity()])
        .mockResolvedValueOnce([createEntity()])
        .mockResolvedValueOnce([createEntity(), createEntity()]),
    });

    const result = await waitForEntityCount(adapter, 'tasks', 2, undefined, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
    expect(result.message).toContain('matched');
    expect(result.message).toContain('Count is 2');
  });

  it('should resolve when count is within min range', async () => {
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([createEntity(), createEntity(), createEntity()]),
    });

    const result = await waitForEntityCount(adapter, 'tasks', { min: 2 }, undefined, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
  });

  it('should resolve when count is within max range', async () => {
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([createEntity()]),
    });

    const result = await waitForEntityCount(adapter, 'tasks', { max: 5 }, undefined, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
  });

  it('should resolve when count is within min-max range', async () => {
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([createEntity(), createEntity()]),
    });

    const result = await waitForEntityCount(adapter, 'tasks', { min: 1, max: 5 }, undefined, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
  });

  it('should apply filters when counting', async () => {
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([createEntity()]),
    });

    await waitForEntityCount(
      adapter,
      'tasks',
      1,
      { status: 'completed' },
      { timeoutMs: 5000, intervalMs: 100 }
    );

    expect(adapter.list).toHaveBeenCalledWith('tasks', { status: 'completed' });
  });
});

// =============================================================================
// executeWaitCondition Tests
// =============================================================================

describe('executeWaitCondition', () => {
  it('should execute wait with string id', async () => {
    const entity = createEntity({ status: 'completed' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const condition: WaitCondition = {
      entity: 'tasks',
      id: 'task-123',
      fields: { status: 'completed' },
    };

    const result = await executeWaitCondition(condition, adapter, {}, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'task-123');
  });

  it('should resolve $alias reference in id', async () => {
    const entity = createEntity({ status: 'completed' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      captured: { myTask: { id: 'resolved-id' } },
    };

    const condition: WaitCondition = {
      entity: 'tasks',
      id: '$myTask.id',
      fields: { status: 'completed' },
    };

    const result = await executeWaitCondition(condition, adapter, context, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'resolved-id');
  });

  it('should resolve { ref: "$alias.field" } format', async () => {
    const entity = createEntity({ status: 'completed' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      captured: { myTask: { id: 'resolved-id' } },
    };

    const condition: WaitCondition = {
      entity: 'tasks',
      id: { ref: '$myTask.id' },
      fields: { status: 'completed' },
    };

    const result = await executeWaitCondition(condition, adapter, context, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'resolved-id');
  });

  it('should resolve { from: alias, field: ... } format', async () => {
    const entity = createEntity({ status: 'completed' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      captured: { myTask: { id: 'resolved-id' } },
    };

    const condition: WaitCondition = {
      entity: 'tasks',
      id: { from: 'myTask', field: 'id' },
      fields: { status: 'completed' },
    };

    const result = await executeWaitCondition(condition, adapter, context, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'resolved-id');
  });

  it('should fail when id cannot be resolved', async () => {
    const adapter = createMockAdapter();
    const context: MatcherContext = { captured: {} };

    const condition: WaitCondition = {
      entity: 'tasks',
      id: '$unknownAlias.id',
      fields: {},
    };

    const result = await executeWaitCondition(condition, adapter, context, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Cannot resolve entity id');
  });

  it('should resolve $userId reference', async () => {
    const entity = createEntity();
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      userId: 'user-456',
    };

    const condition: WaitCondition = {
      entity: 'tasks',
      id: '$userId',
      fields: {},
    };

    const result = await executeWaitCondition(condition, adapter, context, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'user-456');
  });

  it('should handle aliases from aliases map', async () => {
    const entity = createEntity({ status: 'completed' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const aliasMap = new Map<string, { id: string; type: string }>();
    aliasMap.set('myTask', { id: 'map-resolved-id', type: 'tasks' });

    const context: MatcherContext = {
      aliases: aliasMap,
    };

    const condition: WaitCondition = {
      entity: 'tasks',
      id: '$myTask.id',
      fields: { status: 'completed' },
    };

    const result = await executeWaitCondition(condition, adapter, context, {
      timeoutMs: 5000,
      intervalMs: 100,
    });

    expect(result.passed).toBe(true);
    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'map-resolved-id');
  });
});
