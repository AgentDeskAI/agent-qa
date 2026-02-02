/**
 * ExecutionContext Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, type ExecutionContextOptions } from '../../runner/context.js';
import type { AgentAdapter, DatabaseAdapter, TokenUsage } from '../../adapters/types.js';
import type { AliasRegistry, AliasEntry } from '../../scenario/setup.js';
import type { EntityRow } from '../../assertions/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockAgentAdapter(): AgentAdapter {
  return {
    chat: vi.fn().mockResolvedValue({
      text: 'Response',
      toolCalls: [],
      conversationId: 'conv-1',
    }),
  };
}

function createMockDatabaseAdapter(): DatabaseAdapter {
  return {
    findById: vi.fn().mockResolvedValue({ found: false, entity: null }),
    findByTitle: vi.fn().mockResolvedValue({ found: false, entity: null }),
    list: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue({ id: 'new-id' }),
    getSchemas: vi.fn().mockReturnValue([]),
    getSchema: vi.fn().mockReturnValue(undefined),
  };
}

function createMockAliasRegistry(entries?: Map<string, AliasEntry>): AliasRegistry {
  const map = entries ?? new Map();
  return {
    set: (name: string, entry: AliasEntry) => map.set(name, entry),
    get: (name: string) => map.get(name),
    has: (name: string) => map.has(name),
    resolve: (value: string) => value,
    entries: () => new Map(map),
  };
}

function createContextOptions(overrides: Partial<ExecutionContextOptions> = {}): ExecutionContextOptions {
  return {
    userId: 'user-123',
    agent: createMockAgentAdapter(),
    database: createMockDatabaseAdapter(),
    ...overrides,
  };
}

function createEntity(overrides: Partial<EntityRow> = {}): EntityRow {
  return {
    id: 'entity-1',
    title: 'Test Entity',
    ...overrides,
  };
}

// =============================================================================
// Constructor Tests
// =============================================================================

describe('ExecutionContext', () => {
  describe('constructor', () => {
    it('should initialize with required options', () => {
      const options = createContextOptions();

      const context = new ExecutionContext(options);

      expect(context.userId).toBe('user-123');
      expect(context.agent).toBe(options.agent);
      expect(context.database).toBe(options.database);
      expect(context.verbose).toBe(false);
    });

    it('should use verbose option when provided', () => {
      const options = createContextOptions({ verbose: true });

      const context = new ExecutionContext(options);

      expect(context.verbose).toBe(true);
    });

    it('should import aliases from setup', () => {
      const aliasEntries = new Map<string, AliasEntry>([
        ['myTask', { id: 'task-1', type: 'tasks' }],
        ['myList', { id: 'list-1', type: 'lists' }],
      ]);
      const aliases = createMockAliasRegistry(aliasEntries);
      const options = createContextOptions({ aliases });

      const context = new ExecutionContext(options);

      expect(context.hasAlias('myTask')).toBe(true);
      expect(context.hasAlias('myList')).toBe(true);
      expect(context.getAlias('myTask')?.id).toBe('task-1');
    });

    it('should start with empty captured entities', () => {
      const options = createContextOptions();

      const context = new ExecutionContext(options);

      expect(context.getAllCaptured()).toEqual({});
    });

    it('should start with zero token usage', () => {
      const options = createContextOptions();

      const context = new ExecutionContext(options);

      const usage = context.getUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
    });
  });

  // =============================================================================
  // Conversation ID Tests
  // =============================================================================

  describe('conversationId', () => {
    it('should start undefined', () => {
      const context = new ExecutionContext(createContextOptions());

      expect(context.conversationId).toBeUndefined();
    });

    it('should get and set conversationId', () => {
      const context = new ExecutionContext(createContextOptions());

      context.conversationId = 'conv-123';

      expect(context.conversationId).toBe('conv-123');
    });

    it('should allow setting to undefined', () => {
      const context = new ExecutionContext(createContextOptions());
      context.conversationId = 'conv-123';

      context.conversationId = undefined;

      expect(context.conversationId).toBeUndefined();
    });
  });

  // =============================================================================
  // Correlation ID Tests
  // =============================================================================

  describe('correlationId', () => {
    it('should start undefined', () => {
      const context = new ExecutionContext(createContextOptions());

      expect(context.correlationId).toBeUndefined();
    });

    it('should get and set correlationId', () => {
      const context = new ExecutionContext(createContextOptions());

      context.correlationId = 'corr-456';

      expect(context.correlationId).toBe('corr-456');
    });
  });

  // =============================================================================
  // Named Conversation Tests
  // =============================================================================

  describe('named conversations', () => {
    describe('getConversation', () => {
      it('should return undefined for unknown conversation name', () => {
        const context = new ExecutionContext(createContextOptions());

        expect(context.getConversation('unknown')).toBeUndefined();
      });

      it('should return stored conversation ID', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setConversation('conv1', 'conv-abc-123');

        expect(context.getConversation('conv1')).toBe('conv-abc-123');
      });

      it('should normalize conversation name by stripping $ prefix', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setConversation('conv1', 'conv-abc-123');

        expect(context.getConversation('$conv1')).toBe('conv-abc-123');
      });
    });

    describe('setConversation', () => {
      it('should store conversation ID under name', () => {
        const context = new ExecutionContext(createContextOptions());

        context.setConversation('conv1', 'conv-xyz-789');

        expect(context.getConversation('conv1')).toBe('conv-xyz-789');
      });

      it('should normalize name by stripping $ prefix', () => {
        const context = new ExecutionContext(createContextOptions());

        context.setConversation('$conv1', 'conv-xyz-789');

        expect(context.getConversation('conv1')).toBe('conv-xyz-789');
      });

      it('should overwrite existing conversation', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setConversation('conv1', 'conv-old');

        context.setConversation('conv1', 'conv-new');

        expect(context.getConversation('conv1')).toBe('conv-new');
      });

      it('should log when verbose is true', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const context = new ExecutionContext(createContextOptions({ verbose: true }));

        context.setConversation('conv1', 'conv-123');

        expect(consoleSpy).toHaveBeenCalled();
        expect(consoleSpy.mock.calls[0][0]).toContain('Conversation');
        expect(consoleSpy.mock.calls[0][0]).toContain('conv1');

        consoleSpy.mockRestore();
      });

      it('should not log when verbose is false', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const context = new ExecutionContext(createContextOptions({ verbose: false }));

        context.setConversation('conv1', 'conv-123');

        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });

    describe('hasConversation', () => {
      it('should return false for unknown conversation', () => {
        const context = new ExecutionContext(createContextOptions());

        expect(context.hasConversation('unknown')).toBe(false);
      });

      it('should return true for existing conversation', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setConversation('conv1', 'conv-123');

        expect(context.hasConversation('conv1')).toBe(true);
      });

      it('should normalize name for check', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setConversation('conv1', 'conv-123');

        expect(context.hasConversation('$conv1')).toBe(true);
      });
    });

    describe('multi-conversation workflow', () => {
      it('should track multiple independent conversations', () => {
        const context = new ExecutionContext(createContextOptions());

        context.setConversation('conv1', 'conv-aaa');
        context.setConversation('conv2', 'conv-bbb');
        context.setConversation('conv3', 'conv-ccc');

        expect(context.getConversation('conv1')).toBe('conv-aaa');
        expect(context.getConversation('conv2')).toBe('conv-bbb');
        expect(context.getConversation('conv3')).toBe('conv-ccc');
      });
    });
  });

  // =============================================================================
  // Capture Tests
  // =============================================================================

  describe('capture', () => {
    it('should capture an entity under an alias', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity = createEntity({ id: 'task-1', title: 'My Task' });

      context.capture('myTask', entity);

      expect(context.getCaptured('myTask')).toBe(entity);
    });

    it('should normalize alias by stripping $ prefix', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity = createEntity();

      context.capture('$myTask', entity);

      expect(context.getCaptured('myTask')).toBe(entity);
      expect(context.getCaptured('$myTask')).toBe(entity);
    });

    it('should log when verbose is true', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const context = new ExecutionContext(createContextOptions({ verbose: true }));
      const entity = createEntity({ id: 'task-1' });

      context.capture('myTask', entity);

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('Captured');

      consoleSpy.mockRestore();
    });

    it('should not log when verbose is false', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const context = new ExecutionContext(createContextOptions({ verbose: false }));
      const entity = createEntity();

      context.capture('myTask', entity);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should overwrite existing captured entity', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity1 = createEntity({ id: 'task-1' });
      const entity2 = createEntity({ id: 'task-2' });

      context.capture('myTask', entity1);
      context.capture('myTask', entity2);

      expect(context.getCaptured('myTask')?.id).toBe('task-2');
    });
  });

  // =============================================================================
  // getCaptured Tests
  // =============================================================================

  describe('getCaptured', () => {
    it('should return undefined for non-existent alias', () => {
      const context = new ExecutionContext(createContextOptions());

      expect(context.getCaptured('unknown')).toBeUndefined();
    });

    it('should normalize alias for lookup', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity = createEntity();
      context.capture('myTask', entity);

      expect(context.getCaptured('$myTask')).toBe(entity);
    });
  });

  // =============================================================================
  // getAllCaptured Tests
  // =============================================================================

  describe('getAllCaptured', () => {
    it('should return empty object when nothing captured', () => {
      const context = new ExecutionContext(createContextOptions());

      expect(context.getAllCaptured()).toEqual({});
    });

    it('should return all captured entities', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity1 = createEntity({ id: 'task-1' });
      const entity2 = createEntity({ id: 'task-2' });

      context.capture('task1', entity1);
      context.capture('task2', entity2);

      const all = context.getAllCaptured();

      expect(Object.keys(all)).toHaveLength(2);
      expect(all['task1']).toBe(entity1);
      expect(all['task2']).toBe(entity2);
    });
  });

  // =============================================================================
  // Alias Tests
  // =============================================================================

  describe('alias management', () => {
    describe('setAlias', () => {
      it('should set an alias entry', () => {
        const context = new ExecutionContext(createContextOptions());

        context.setAlias('myTask', { id: 'task-1', type: 'tasks' });

        expect(context.hasAlias('myTask')).toBe(true);
        expect(context.getAlias('myTask')?.id).toBe('task-1');
      });

      it('should normalize alias name', () => {
        const context = new ExecutionContext(createContextOptions());

        context.setAlias('$myTask', { id: 'task-1', type: 'tasks' });

        expect(context.hasAlias('myTask')).toBe(true);
      });
    });

    describe('getAlias', () => {
      it('should return undefined for non-existent alias', () => {
        const context = new ExecutionContext(createContextOptions());

        expect(context.getAlias('unknown')).toBeUndefined();
      });

      it('should normalize alias for lookup', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setAlias('myTask', { id: 'task-1', type: 'tasks' });

        expect(context.getAlias('$myTask')?.id).toBe('task-1');
      });
    });

    describe('hasAlias', () => {
      it('should return false for non-existent alias', () => {
        const context = new ExecutionContext(createContextOptions());

        expect(context.hasAlias('unknown')).toBe(false);
      });

      it('should return true for existing alias', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setAlias('myTask', { id: 'task-1', type: 'tasks' });

        expect(context.hasAlias('myTask')).toBe(true);
      });

      it('should normalize alias for check', () => {
        const context = new ExecutionContext(createContextOptions());
        context.setAlias('myTask', { id: 'task-1', type: 'tasks' });

        expect(context.hasAlias('$myTask')).toBe(true);
      });
    });
  });

  // =============================================================================
  // Token Usage Tests
  // =============================================================================

  describe('token usage', () => {
    describe('addUsage', () => {
      it('should accumulate token usage', () => {
        const context = new ExecutionContext(createContextOptions());

        context.addUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
        context.addUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 });

        const usage = context.getUsage();
        expect(usage.inputTokens).toBe(300);
        expect(usage.outputTokens).toBe(150);
        expect(usage.totalTokens).toBe(450);
      });
    });

    describe('getUsage', () => {
      it('should return a copy of usage', () => {
        const context = new ExecutionContext(createContextOptions());
        context.addUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });

        const usage1 = context.getUsage();
        const usage2 = context.getUsage();

        expect(usage1).not.toBe(usage2);
        expect(usage1).toEqual(usage2);
      });
    });
  });

  // =============================================================================
  // getMatcherContext Tests
  // =============================================================================

  describe('getMatcherContext', () => {
    it('should return context with captured entities', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity = createEntity({ id: 'task-1' });
      context.capture('myTask', entity);

      const matcherContext = context.getMatcherContext();

      expect(matcherContext.captured).toHaveProperty('myTask');
      expect(matcherContext.captured['myTask']).toBe(entity);
    });

    it('should return context with aliases', () => {
      const context = new ExecutionContext(createContextOptions());
      context.setAlias('myList', { id: 'list-1', type: 'lists' });

      const matcherContext = context.getMatcherContext();

      expect(matcherContext.aliases?.get('myList')?.id).toBe('list-1');
    });

    it('should include userId', () => {
      const context = new ExecutionContext(createContextOptions({ userId: 'user-abc' }));

      const matcherContext = context.getMatcherContext();

      expect(matcherContext.userId).toBe('user-abc');
    });
  });

  // =============================================================================
  // getCapturedState Tests
  // =============================================================================

  describe('getCapturedState', () => {
    it('should return captured state for report', () => {
      const context = new ExecutionContext(createContextOptions({ userId: 'user-abc' }));
      const entity = createEntity({ id: 'task-1' });
      context.capture('myTask', entity);
      context.conversationId = 'conv-123';

      const state = context.getCapturedState();

      expect(state.entities).toHaveProperty('myTask');
      expect(state.conversationId).toBe('conv-123');
      expect(state.userId).toBe('user-abc');
    });

    it('should return undefined conversationId when not set', () => {
      const context = new ExecutionContext(createContextOptions());

      const state = context.getCapturedState();

      expect(state.conversationId).toBeUndefined();
    });
  });

  // =============================================================================
  // resolve Tests
  // =============================================================================

  describe('resolve', () => {
    it('should return literal value unchanged', () => {
      const context = new ExecutionContext(createContextOptions());

      const result = context.resolve('literal-value');

      expect(result).toBe('literal-value');
    });

    it('should resolve $userId to context userId', () => {
      const context = new ExecutionContext(createContextOptions({ userId: 'user-xyz' }));

      const result = context.resolve('$userId');

      expect(result).toBe('user-xyz');
    });

    it('should resolve alias from captured entities', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity = createEntity({ id: 'task-123', title: 'Test' });
      context.capture('myTask', entity);

      const result = context.resolve('$myTask.id');

      expect(result).toBe('task-123');
    });

    it('should resolve alias from setup aliases', () => {
      const context = new ExecutionContext(createContextOptions());
      context.setAlias('myList', { id: 'list-456', type: 'lists' });

      const result = context.resolve('$myList');

      expect(result).toBe('list-456');
    });

    it('should return original value if alias not found', () => {
      const context = new ExecutionContext(createContextOptions());

      const result = context.resolve('$unknown');

      expect(result).toBe('$unknown');
    });
  });

  // =============================================================================
  // clone Tests
  // =============================================================================

  describe('clone', () => {
    it('should create new context with same options', () => {
      const options = createContextOptions({ userId: 'user-abc', verbose: true });
      const context = new ExecutionContext(options);

      const cloned = context.clone();

      expect(cloned).not.toBe(context);
      expect(cloned.userId).toBe('user-abc');
      expect(cloned.verbose).toBe(true);
      expect(cloned.agent).toBe(options.agent);
      expect(cloned.database).toBe(options.database);
    });

    it('should copy aliases', () => {
      const context = new ExecutionContext(createContextOptions());
      context.setAlias('myTask', { id: 'task-1', type: 'tasks' });
      context.setAlias('myList', { id: 'list-1', type: 'lists' });

      const cloned = context.clone();

      expect(cloned.hasAlias('myTask')).toBe(true);
      expect(cloned.hasAlias('myList')).toBe(true);
      expect(cloned.getAlias('myTask')?.id).toBe('task-1');
    });

    it('should not copy captured entities', () => {
      const context = new ExecutionContext(createContextOptions());
      const entity = createEntity();
      context.capture('myTask', entity);

      const cloned = context.clone();

      expect(cloned.getCaptured('myTask')).toBeUndefined();
    });

    it('should not copy conversation ID', () => {
      const context = new ExecutionContext(createContextOptions());
      context.conversationId = 'conv-123';

      const cloned = context.clone();

      expect(cloned.conversationId).toBeUndefined();
    });

    it('should not copy token usage', () => {
      const context = new ExecutionContext(createContextOptions());
      context.addUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });

      const cloned = context.clone();

      const usage = cloned.getUsage();
      expect(usage.totalTokens).toBe(0);
    });

    it('should create independent alias storage', () => {
      const context = new ExecutionContext(createContextOptions());
      context.setAlias('myTask', { id: 'task-1', type: 'tasks' });

      const cloned = context.clone();
      cloned.setAlias('newAlias', { id: 'new-1', type: 'new' });

      expect(context.hasAlias('newAlias')).toBe(false);
    });
  });
});
