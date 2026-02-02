/**
 * Entity Assertions Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyEntity,
  assertCreatedEntities,
  verifyEntities,
  assertEntityCount,
  type EntityQueryAdapter,
} from '../../assertions/entity.js';
import type { MatcherContext } from '../../assertions/matchers.js';
import type { EntityRow } from '../../assertions/types.js';

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
    status: 'active',
    userId: 'user-123',
    ...data,
  };
}

// =============================================================================
// verifyEntity Tests
// =============================================================================

describe('verifyEntity', () => {
  describe('entity lookup', () => {
    it('should find entity by id', async () => {
      const entity = createEntity();
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const result = await verifyEntity(adapter, 'tasks', { id: 'entity-1' }, {});

      expect(adapter.findById).toHaveBeenCalledWith('tasks', 'entity-1');
      expect(result.passed).toBe(true);
    });

    it('should find entity by title', async () => {
      const entity = createEntity();
      const adapter = createMockAdapter({
        findByTitle: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const result = await verifyEntity(adapter, 'tasks', { title: 'Test Entity' }, {});

      expect(adapter.findByTitle).toHaveBeenCalledWith('tasks', 'Test Entity');
      expect(result.passed).toBe(true);
    });

    it('should prefer id over title when both provided', async () => {
      const entity = createEntity();
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      await verifyEntity(adapter, 'tasks', { id: 'entity-1', title: 'Test Entity' }, {});

      expect(adapter.findById).toHaveBeenCalled();
      expect(adapter.findByTitle).not.toHaveBeenCalled();
    });

    it('should fail when no identifier provided', async () => {
      const adapter = createMockAdapter();

      const result = await verifyEntity(adapter, 'tasks', {}, {});

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No identifier provided');
    });

    it('should fail when entity not found by id', async () => {
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: false, entity: null }),
      });

      const result = await verifyEntity(adapter, 'tasks', { id: 'missing-1' }, {});

      expect(result.passed).toBe(false);
      expect(result.message).toContain('tasks not found');
      expect(result.message).toContain('missing-1');
    });

    it('should fail when entity not found by title', async () => {
      const adapter = createMockAdapter({
        findByTitle: vi.fn().mockResolvedValue({ found: false, entity: null }),
      });

      const result = await verifyEntity(adapter, 'tasks', { title: 'Missing Task' }, {});

      expect(result.passed).toBe(false);
      expect(result.message).toContain('tasks not found');
      expect(result.message).toContain('title="Missing Task"');
    });
  });

  describe('field matching', () => {
    it('should pass when all fields match', async () => {
      const entity = createEntity({ status: 'completed', priority: 'high' });
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const result = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { status: 'completed', priority: 'high' }
      );

      expect(result.passed).toBe(true);
    });

    it('should fail when field does not match', async () => {
      const entity = createEntity({ status: 'pending' });
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const result = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { status: 'completed' }
      );

      expect(result.passed).toBe(false);
    });

    it('should handle $contains matcher', async () => {
      const entity = createEntity({ description: 'This is a test description' });
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const result = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { description: { contains: 'test' } }
      );

      expect(result.passed).toBe(true);
    });

    it('should handle $exists matcher', async () => {
      const entity = createEntity({ optionalField: undefined });
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      // Field does not exist
      const result1 = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { missingField: { exists: false } }
      );
      expect(result1.passed).toBe(true);

      // Field exists
      const entityWithField = createEntity({ optionalField: 'value' });
      const adapter2 = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity: entityWithField }),
      });
      const result2 = await verifyEntity(
        adapter2,
        'tasks',
        { id: 'entity-1' },
        { optionalField: { exists: true } }
      );
      expect(result2.passed).toBe(true);
    });

    it('should handle $gt/$lt/$gte/$lte matchers', async () => {
      const entity = createEntity({ count: 10 });
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const resultGt = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { count: { gt: 5 } }
      );
      expect(resultGt.passed).toBe(true);

      const resultLt = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { count: { lt: 15 } }
      );
      expect(resultLt.passed).toBe(true);

      const resultGte = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { count: { gte: 10 } }
      );
      expect(resultGte.passed).toBe(true);

      const resultLte = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { count: { lte: 10 } }
      );
      expect(resultLte.passed).toBe(true);
    });

    it('should handle $regex matcher', async () => {
      const entity = createEntity({ email: 'user@example.com' });
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const result = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { email: { matches: '^user@.*\\.com$' } }
      );

      expect(result.passed).toBe(true);
    });
  });

  describe('alias resolution', () => {
    it('should resolve $ref matcher from captured entities', async () => {
      const entity = createEntity({ listId: 'list-123' });
      const adapter = createMockAdapter({
        findById: vi.fn().mockResolvedValue({ found: true, entity }),
      });

      const context: MatcherContext = {
        captured: {
          myList: { id: 'list-123', title: 'My List' },
        },
      };

      const result = await verifyEntity(
        adapter,
        'tasks',
        { id: 'entity-1' },
        { listId: { from: 'myList', field: 'id' } },
        { context }
      );

      expect(result.passed).toBe(true);
    });
  });
});

// =============================================================================
// assertCreatedEntities Tests
// =============================================================================

describe('assertCreatedEntities', () => {
  it('should pass when entity is created with matching fields', async () => {
    const entity = createEntity({ title: 'New Task', status: 'pending' });
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([entity]),
    });

    const { result } = await assertCreatedEntities(adapter, [
      {
        entity: 'tasks',
        fields: { title: 'New Task' },
      },
    ]);

    expect(result.passed).toBe(true);
  });

  it('should fail when no entities found', async () => {
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([]),
    });

    const { result } = await assertCreatedEntities(adapter, [
      {
        entity: 'tasks',
        fields: { title: 'Missing Task' },
      },
    ]);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('No tasks found');
  });

  it('should fail when entities exist but none match field assertions', async () => {
    const entity = createEntity({ title: 'Different Task' });
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([entity]),
    });

    const { result } = await assertCreatedEntities(adapter, [
      {
        entity: 'tasks',
        fields: { title: 'Expected Task' },
      },
    ]);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('none matched');
  });

  it('should capture entity to alias when "as" is specified', async () => {
    const entity = createEntity({ id: 'task-999', title: 'Captured Task' });
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([entity]),
    });

    const { result, captured } = await assertCreatedEntities(adapter, [
      {
        entity: 'tasks',
        fields: { title: 'Captured Task' },
        as: 'myTask',
      },
    ]);

    expect(result.passed).toBe(true);
    expect(captured).toHaveProperty('myTask');
    expect(captured.myTask.id).toBe('task-999');
  });

  it('should handle multiple entity assertions', async () => {
    const task = createEntity({ id: 'task-1', title: 'Task' });
    const reminder = createEntity({ id: 'reminder-1', title: 'Reminder' });

    const adapter = createMockAdapter({
      list: vi.fn().mockImplementation((entityType: string) => {
        if (entityType === 'tasks') return Promise.resolve([task]);
        if (entityType === 'reminders') return Promise.resolve([reminder]);
        return Promise.resolve([]);
      }),
    });

    const { result, captured } = await assertCreatedEntities(adapter, [
      { entity: 'tasks', fields: { title: 'Task' }, as: 'task1' },
      { entity: 'reminders', fields: { title: 'Reminder' }, as: 'reminder1' },
    ]);

    expect(result.passed).toBe(true);
    expect(captured).toHaveProperty('task1');
    expect(captured).toHaveProperty('reminder1');
  });

  it('should use simple string values as filters', async () => {
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([createEntity()]),
    });

    await assertCreatedEntities(adapter, [
      {
        entity: 'tasks',
        fields: { title: 'Filter Value', status: 'pending' },
      },
    ]);

    expect(adapter.list).toHaveBeenCalledWith('tasks', {
      title: 'Filter Value',
      status: 'pending',
    });
  });

  it('should not use reference values as filters', async () => {
    const adapter = createMockAdapter({
      list: vi.fn().mockResolvedValue([createEntity({ listId: 'list-123' })]),
    });

    const context: MatcherContext = {
      captured: { myList: { id: 'list-123' } },
    };

    await assertCreatedEntities(
      adapter,
      [
        {
          entity: 'tasks',
          fields: { title: 'Task', listId: '$myList.id' },
        },
      ],
      context
    );

    // listId should not be in filters because it starts with $
    expect(adapter.list).toHaveBeenCalledWith('tasks', { title: 'Task' });
  });
});

// =============================================================================
// verifyEntities Tests
// =============================================================================

describe('verifyEntities', () => {
  it('should verify single entity type with single entity', async () => {
    const entity = createEntity({ title: 'Task 1' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const result = await verifyEntities(
      adapter,
      {
        tasks: [{ id: 'entity-1', fields: { title: 'Task 1' } }],
      }
    );

    expect(result.passed).toBe(true);
  });

  it('should verify multiple entity types', async () => {
    const task = createEntity({ id: 'task-1', title: 'Task' });
    const reminder = createEntity({ id: 'reminder-1', title: 'Reminder' });

    const adapter = createMockAdapter({
      findById: vi.fn().mockImplementation((entityType: string, id: string) => {
        if (entityType === 'tasks' && id === 'task-1') {
          return Promise.resolve({ found: true, entity: task });
        }
        if (entityType === 'reminders' && id === 'reminder-1') {
          return Promise.resolve({ found: true, entity: reminder });
        }
        return Promise.resolve({ found: false, entity: null });
      }),
    });

    const result = await verifyEntities(adapter, {
      tasks: [{ id: 'task-1', fields: { title: 'Task' } }],
      reminders: [{ id: 'reminder-1', fields: { title: 'Reminder' } }],
    });

    expect(result.passed).toBe(true);
  });

  it('should combine results from all verifications', async () => {
    const entity = createEntity({ title: 'Task' });
    const adapter = createMockAdapter({
      findById: vi.fn()
        .mockResolvedValueOnce({ found: true, entity })
        .mockResolvedValueOnce({ found: false, entity: null }),
    });

    const result = await verifyEntities(adapter, {
      tasks: [
        { id: 'task-1', fields: { title: 'Task' } },
        { id: 'task-missing', fields: { title: 'Missing' } },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('1 of 2');
  });

  it('should resolve alias references in id field', async () => {
    const entity = createEntity({ id: 'resolved-id' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      captured: { myTask: { id: 'resolved-id', title: 'Task' } },
    };

    const result = await verifyEntities(
      adapter,
      {
        tasks: [{ id: '$myTask.id', fields: {} }],
      },
      context
    );

    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'resolved-id');
    expect(result.passed).toBe(true);
  });

  it('should handle { ref: "$alias.field" } format', async () => {
    const entity = createEntity({ id: 'resolved-id' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      captured: { myTask: { id: 'resolved-id', title: 'Task' } },
    };

    const result = await verifyEntities(
      adapter,
      {
        tasks: [{ id: { ref: '$myTask.id' }, fields: {} }],
      },
      context
    );

    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'resolved-id');
    expect(result.passed).toBe(true);
  });

  it('should handle { from: alias, field: ... } format', async () => {
    const entity = createEntity({ id: 'resolved-id' });
    const adapter = createMockAdapter({
      findById: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const context: MatcherContext = {
      captured: { myTask: { id: 'resolved-id', title: 'Task' } },
    };

    const result = await verifyEntities(
      adapter,
      {
        tasks: [{ id: { from: 'myTask', field: 'id' }, fields: {} }],
      },
      context
    );

    expect(adapter.findById).toHaveBeenCalledWith('tasks', 'resolved-id');
    expect(result.passed).toBe(true);
  });

  it('should fail when alias cannot be resolved', async () => {
    const adapter = createMockAdapter();
    const context: MatcherContext = { captured: {} };

    const result = await verifyEntities(
      adapter,
      {
        tasks: [{ id: '$unknownAlias.id', fields: {} }],
      },
      context
    );

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Cannot resolve reference');
  });

  it('should fail when no identifier provided', async () => {
    const adapter = createMockAdapter();

    const result = await verifyEntities(adapter, {
      tasks: [{ fields: { title: 'Task' } }],
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('No identifier');
  });

  it('should find entity by title', async () => {
    const entity = createEntity({ title: 'Find Me' });
    const adapter = createMockAdapter({
      findByTitle: vi.fn().mockResolvedValue({ found: true, entity }),
    });

    const result = await verifyEntities(adapter, {
      tasks: [{ title: 'Find Me', fields: { status: 'active' } }],
    });

    expect(adapter.findByTitle).toHaveBeenCalledWith('tasks', 'Find Me');
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// assertEntityCount Tests
// =============================================================================

describe('assertEntityCount', () => {
  describe('exact count', () => {
    it('should pass when count matches exactly', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([createEntity(), createEntity()]),
      });

      const result = await assertEntityCount(adapter, 'tasks', 2);

      expect(result.passed).toBe(true);
      expect(result.message).toContain('tasks count: 2');
    });

    it('should fail when count does not match', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([createEntity()]),
      });

      const result = await assertEntityCount(adapter, 'tasks', 5);

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Expected 5 tasks(s), got 1');
    });

    it('should pass with zero expected count', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([]),
      });

      const result = await assertEntityCount(adapter, 'tasks', 0);

      expect(result.passed).toBe(true);
    });
  });

  describe('range count', () => {
    it('should pass when count is within range', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([createEntity(), createEntity(), createEntity()]),
      });

      const result = await assertEntityCount(adapter, 'tasks', { min: 2, max: 5 });

      expect(result.passed).toBe(true);
      expect(result.message).toContain('within range');
    });

    it('should fail when count is below min', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([createEntity()]),
      });

      const result = await assertEntityCount(adapter, 'tasks', { min: 3 });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Expected at least 3 tasks(s), got 1');
    });

    it('should fail when count is above max', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([
          createEntity(),
          createEntity(),
          createEntity(),
          createEntity(),
          createEntity(),
        ]),
      });

      const result = await assertEntityCount(adapter, 'tasks', { max: 3 });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Expected at most 3 tasks(s), got 5');
    });

    it('should pass with only min constraint', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([createEntity(), createEntity()]),
      });

      const result = await assertEntityCount(adapter, 'tasks', { min: 1 });

      expect(result.passed).toBe(true);
    });

    it('should pass with only max constraint', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([createEntity()]),
      });

      const result = await assertEntityCount(adapter, 'tasks', { max: 5 });

      expect(result.passed).toBe(true);
    });
  });

  describe('filters', () => {
    it('should apply filters when counting', async () => {
      const adapter = createMockAdapter({
        list: vi.fn().mockResolvedValue([createEntity()]),
      });

      await assertEntityCount(adapter, 'tasks', 1, { status: 'completed' });

      expect(adapter.list).toHaveBeenCalledWith('tasks', { status: 'completed' });
    });
  });
});
