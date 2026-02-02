/**
 * Tests for Drizzle Database Adapter
 *
 * Uses a mocked Drizzle instance to test adapter behavior without a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createDrizzleAdapter } from '../adapters/database/drizzle-adapter.js';
import type { EntityConfig } from '../config/types.js';

// Mock drizzle-orm module
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column, value) => ({ column, value, type: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
  getTableName: vi.fn((table) => table._tableName ?? 'unknown_table'),
  getTableColumns: vi.fn((table) => table._columns ?? {}),
}));

// Create a mock Drizzle table
function createMockTable(name: string, columns: string[]): EntityConfig['table'] {
  const table: Record<string, unknown> = {
    _tableName: name,
    _columns: columns.reduce((acc, col) => ({ ...acc, [col]: { name: col } }), {}),
  };

  // Add columns as properties
  for (const col of columns) {
    table[col] = { name: col };
  }

  return table;
}

// Create a mock Drizzle database
function createMockDb() {
  let mockResults: unknown[] = [];

  // We need to create a proper chain that resolves correctly
  // The 'from' method should return an object that supports both .where() and direct iteration
  const createChain = () => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(mockResults)),
      values: vi.fn(() => chain),
      returning: vi.fn(() => Promise.resolve(mockResults)),
      set: vi.fn(() => chain),
      // Allow the chain to be awaited directly (for list without .limit())
      then: (resolve: (value: unknown[]) => void) => {
        resolve(mockResults);
        return Promise.resolve(mockResults);
      },
    };
    return chain;
  };

  const db = {
    select: vi.fn(() => createChain()),
    insert: vi.fn(() => createChain()),
    update: vi.fn(() => createChain()),
    delete: vi.fn(() => createChain()),
    _setResults: (results: unknown[]) => {
      mockResults = [...results];
    },
    _resetMocks: () => {
      db.select.mockClear();
      db.insert.mockClear();
      db.update.mockClear();
      db.delete.mockClear();
    },
  };

  return db;
}

describe('Drizzle Database Adapter', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let tasksTable: EntityConfig['table'];
  let remindersTable: EntityConfig['table'];
  let entities: EntityConfig[];

  beforeEach(() => {
    mockDb = createMockDb();
    tasksTable = createMockTable('tasks', ['id', 'userId', 'title', 'status', 'dueDate']);
    remindersTable = createMockTable('reminders', ['id', 'userId', 'text', 'scheduledFor']);

    entities = [
      { table: tasksTable, name: 'tasks', titleColumn: 'title' },
      { table: remindersTable, name: 'reminders', titleColumn: 'text' },
    ];
  });

  describe('createDrizzleAdapter', () => {
    it('should create an adapter with correct methods', () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      expect(adapter.findById).toBeDefined();
      expect(adapter.findByTitle).toBeDefined();
      expect(adapter.list).toBeDefined();
      expect(adapter.insert).toBeDefined();
      expect(adapter.update).toBeDefined();
      expect(adapter.delete).toBeDefined();
      expect(adapter.getSchemas).toBeDefined();
      expect(adapter.getSchema).toBeDefined();
    });

    it('should throw if entity table is undefined', () => {
      const badEntities = [{ table: undefined as unknown as EntityConfig['table'], name: 'bad' }];

      expect(() => createDrizzleAdapter({ db: mockDb, entities: badEntities }))
        .toThrow('Entity "bad": table is undefined');
    });
  });

  describe('getSchemas', () => {
    it('should return all entity schemas', () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const schemas = adapter.getSchemas();

      expect(schemas).toHaveLength(2);
      expect(schemas[0].name).toBe('tasks');
      expect(schemas[0].tableName).toBe('tasks');
      expect(schemas[0].titleColumn).toBe('title');
      expect(schemas[0].userIdColumn).toBe('userId');
      expect(schemas[1].name).toBe('reminders');
    });

    it('should use custom defaultUserIdColumn', () => {
      const adapter = createDrizzleAdapter({
        db: mockDb,
        entities,
        defaultUserIdColumn: 'ownerId',
      });
      const schemas = adapter.getSchemas();

      expect(schemas[0].userIdColumn).toBe('ownerId');
    });

    it('should use entity-specific userIdColumn override', () => {
      const entitiesWithOverride = [
        { table: tasksTable, name: 'tasks', titleColumn: 'title', userIdColumn: 'createdBy' },
      ];
      const adapter = createDrizzleAdapter({ db: mockDb, entities: entitiesWithOverride });
      const schemas = adapter.getSchemas();

      expect(schemas[0].userIdColumn).toBe('createdBy');
    });

    it('should fall back to default when userIdColumn is null', () => {
      // Note: The implementation uses ?? which treats null as falsy
      // So null will fall back to the defaultUserIdColumn
      const entitiesWithNull = [
        { table: tasksTable, name: 'tasks', titleColumn: 'title', userIdColumn: null },
      ];
      const adapter = createDrizzleAdapter({ db: mockDb, entities: entitiesWithNull });
      const schemas = adapter.getSchemas();

      // Current behavior: null falls back to default 'userId'
      expect(schemas[0].userIdColumn).toBe('userId');
    });
  });

  describe('getSchema', () => {
    it('should return schema for known entity', () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const schema = adapter.getSchema('tasks');

      expect(schema).toBeDefined();
      expect(schema?.name).toBe('tasks');
    });

    it('should return undefined for unknown entity', () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const schema = adapter.getSchema('unknown');

      expect(schema).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should find entity by id', async () => {
      const mockTask = { id: 'task_1', title: 'Test Task', status: 'active' };
      mockDb._setResults([mockTask]);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const result = await adapter.findById('tasks', 'task_1');

      expect(result.found).toBe(true);
      expect(result.entity).toEqual(mockTask);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return not found for missing entity', async () => {
      mockDb._setResults([]);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const result = await adapter.findById('tasks', 'nonexistent');

      expect(result.found).toBe(false);
      expect(result.entity).toBeNull();
    });

    it('should throw for unknown entity type', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      await expect(adapter.findById('unknown', 'id_1'))
        .rejects.toThrow('Unknown entity: unknown');
    });
  });

  describe('findByTitle', () => {
    it('should find entity by title', async () => {
      const mockTask = { id: 'task_1', title: 'Buy groceries', status: 'active' };
      mockDb._setResults([mockTask]);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const result = await adapter.findByTitle('tasks', 'Buy groceries');

      expect(result.found).toBe(true);
      expect(result.entity).toEqual(mockTask);
    });

    it('should return not found when title not found', async () => {
      mockDb._setResults([]);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const result = await adapter.findByTitle('tasks', 'Nonexistent task');

      expect(result.found).toBe(false);
      expect(result.entity).toBeNull();
    });

    it('should throw if entity has no titleColumn', async () => {
      const entitiesNoTitle = [{ table: tasksTable, name: 'tasks' }];
      const adapter = createDrizzleAdapter({ db: mockDb, entities: entitiesNoTitle });

      await expect(adapter.findByTitle('tasks', 'Test'))
        .rejects.toThrow('Entity tasks has no titleColumn configured');
    });

    it('should throw for unknown entity type', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      await expect(adapter.findByTitle('unknown', 'title'))
        .rejects.toThrow('Unknown entity: unknown');
    });
  });

  describe('list', () => {
    it('should list all entities without filters', async () => {
      const mockTasks = [
        { id: 'task_1', title: 'Task 1' },
        { id: 'task_2', title: 'Task 2' },
      ];
      mockDb._setResults(mockTasks);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const results = await adapter.list('tasks');

      expect(results).toHaveLength(2);
      expect(results).toEqual(mockTasks);
    });

    it('should apply filters when provided', async () => {
      const mockTasks = [{ id: 'task_1', title: 'Task 1', status: 'active' }];
      mockDb._setResults(mockTasks);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const results = await adapter.list('tasks', { status: 'active' });

      expect(results).toEqual(mockTasks);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should throw for unknown entity type', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      await expect(adapter.list('unknown'))
        .rejects.toThrow('Unknown entity: unknown');
    });
  });

  describe('insert', () => {
    it('should insert entity and return id', async () => {
      mockDb._setResults([{ id: 'new_task_1' }]);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      const result = await adapter.insert('tasks', { title: 'New Task', status: 'active' });

      expect(result.id).toBe('new_task_1');
      expect(mockDb.insert).toHaveBeenCalledWith(tasksTable);
    });

    it('should use custom insert function if provided', async () => {
      const customInsert = vi.fn().mockResolvedValue({ id: 'custom_id' });
      const entitiesWithCustom = [
        { table: tasksTable, name: 'tasks', insert: customInsert },
      ];

      const adapter = createDrizzleAdapter({ db: mockDb, entities: entitiesWithCustom });
      const result = await adapter.insert('tasks', { title: 'Custom Task' });

      expect(result.id).toBe('custom_id');
      expect(customInsert).toHaveBeenCalledWith(mockDb, { title: 'Custom Task' });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should throw if insert returns no results', async () => {
      mockDb._setResults([]);

      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      await expect(adapter.insert('tasks', { title: 'Fail' }))
        .rejects.toThrow('Insert failed for tasks');
    });

    it('should throw for unknown entity type', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      await expect(adapter.insert('unknown', {}))
        .rejects.toThrow('Unknown entity: unknown');
    });
  });

  describe('update', () => {
    it('should update entity by id', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      await adapter.update('tasks', 'task_1', { status: 'completed' });

      expect(mockDb.update).toHaveBeenCalledWith(tasksTable);
    });

    it('should throw for unknown entity type', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      await expect(adapter.update('unknown', 'id', {}))
        .rejects.toThrow('Unknown entity: unknown');
    });
  });

  describe('delete', () => {
    it('should delete entity by id', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });
      await adapter.delete('tasks', 'task_1');

      expect(mockDb.delete).toHaveBeenCalledWith(tasksTable);
    });

    it('should throw for unknown entity type', async () => {
      const adapter = createDrizzleAdapter({ db: mockDb, entities });

      await expect(adapter.delete('unknown', 'id'))
        .rejects.toThrow('Unknown entity: unknown');
    });
  });

  describe('verbose logging', () => {
    it('should log operations when verbose is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockDb._setResults([{ id: 'task_1' }]);

      const adapter = createDrizzleAdapter({ db: mockDb, entities, verbose: true });
      await adapter.findById('tasks', 'task_1');

      expect(consoleSpy).toHaveBeenCalledWith('[DB] findById: tasks task_1');
      consoleSpy.mockRestore();
    });
  });
});
