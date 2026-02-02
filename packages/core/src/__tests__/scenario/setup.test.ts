/**
 * Scenario Setup Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createAliasRegistry,
  runSetupSteps,
  type SetupExecutor,
  type RunSetupOptions,
} from '../../scenario/setup.js';
import type { ScenarioSetupStep } from '../../scenario/types.js';

// =============================================================================
// createAliasRegistry Tests
// =============================================================================

describe('createAliasRegistry', () => {
  describe('set and get', () => {
    it('should set and get an alias', () => {
      const registry = createAliasRegistry();
      registry.set('myTask', { id: 'task-123', type: 'tasks' });

      const entry = registry.get('myTask');

      expect(entry).toBeDefined();
      expect(entry!.id).toBe('task-123');
      expect(entry!.type).toBe('tasks');
    });

    it('should return undefined for unknown alias', () => {
      const registry = createAliasRegistry();

      const entry = registry.get('unknown');

      expect(entry).toBeUndefined();
    });

    it('should overwrite existing alias', () => {
      const registry = createAliasRegistry();
      registry.set('myTask', { id: 'task-1', type: 'tasks' });
      registry.set('myTask', { id: 'task-2', type: 'tasks' });

      const entry = registry.get('myTask');

      expect(entry!.id).toBe('task-2');
    });
  });

  describe('has', () => {
    it('should return true for existing alias', () => {
      const registry = createAliasRegistry();
      registry.set('myTask', { id: 'task-123', type: 'tasks' });

      expect(registry.has('myTask')).toBe(true);
    });

    it('should return false for non-existing alias', () => {
      const registry = createAliasRegistry();

      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('resolve', () => {
    it('should resolve alias reference to id', () => {
      const registry = createAliasRegistry();
      registry.set('myTask', { id: 'task-456', type: 'tasks' });

      const resolved = registry.resolve('$myTask', { userId: 'user-1' });

      expect(resolved).toBe('task-456');
    });

    it('should return literal value unchanged', () => {
      const registry = createAliasRegistry();

      const resolved = registry.resolve('literal-value', { userId: 'user-1' });

      expect(resolved).toBe('literal-value');
    });

    it('should resolve $userId to context userId', () => {
      const registry = createAliasRegistry();

      const resolved = registry.resolve('$userId', { userId: 'user-789' });

      expect(resolved).toBe('user-789');
    });

    it('should throw for $userId when no userId in context', () => {
      const registry = createAliasRegistry();

      expect(() => registry.resolve('$userId', {})).toThrow('Cannot resolve $userId');
    });

    it('should throw for unknown alias', () => {
      const registry = createAliasRegistry();

      expect(() => registry.resolve('$unknown', { userId: 'user-1' })).toThrow('Unknown alias');
    });
  });

  describe('entries', () => {
    it('should return all entries as a Map', () => {
      const registry = createAliasRegistry();
      registry.set('task1', { id: 't1', type: 'tasks' });
      registry.set('task2', { id: 't2', type: 'tasks' });

      const entries = registry.entries();

      expect(entries.size).toBe(2);
      expect(entries.get('task1')).toEqual({ id: 't1', type: 'tasks' });
      expect(entries.get('task2')).toEqual({ id: 't2', type: 'tasks' });
    });

    it('should return a copy (not the internal map)', () => {
      const registry = createAliasRegistry();
      registry.set('task1', { id: 't1', type: 'tasks' });

      const entries = registry.entries();
      entries.set('modified', { id: 'm1', type: 'test' });

      expect(registry.has('modified')).toBe(false);
    });
  });
});

// =============================================================================
// runSetupSteps Tests
// =============================================================================

describe('runSetupSteps', () => {
  function createMockExecutor(overrides: Partial<SetupExecutor> = {}): SetupExecutor {
    return {
      insert: vi.fn().mockResolvedValue({ id: 'generated-id' }),
      ...overrides,
    };
  }

  describe('insert steps', () => {
    it('should execute insert step', async () => {
      const executor = createMockExecutor();
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { title: 'Test Task' } },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(executor.insert).toHaveBeenCalledWith('tasks', { title: 'Test Task' });
    });

    it('should register alias when "as" is specified', async () => {
      const executor = createMockExecutor({
        insert: vi.fn().mockResolvedValue({ id: 'task-999' }),
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { title: 'Test' }, as: 'myTask' },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(result.aliases.has('myTask')).toBe(true);
      expect(result.aliases.get('myTask')!.id).toBe('task-999');
      expect(result.aliases.get('myTask')!.type).toBe('tasks');
    });

    it('should resolve alias references in data', async () => {
      const executor = createMockExecutor({
        insert: vi.fn()
          .mockResolvedValueOnce({ id: 'list-1' })
          .mockResolvedValueOnce({ id: 'task-1' }),
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'lists', data: { title: 'My List' }, as: 'myList' },
        { insert: 'tasks', data: { title: 'Task', listId: '$myList' } },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(executor.insert).toHaveBeenNthCalledWith(2, 'tasks', {
        title: 'Task',
        listId: 'list-1',
      });
    });

    it('should resolve $userId in data', async () => {
      const executor = createMockExecutor();
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { title: 'Task', ownerId: '$userId' } },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-abc',
      });

      expect(result.success).toBe(true);
      expect(executor.insert).toHaveBeenCalledWith('tasks', {
        title: 'Task',
        ownerId: 'user-abc',
      });
    });

    it('should handle multiple insert steps', async () => {
      const executor = createMockExecutor({
        insert: vi.fn()
          .mockResolvedValueOnce({ id: 'task-1' })
          .mockResolvedValueOnce({ id: 'task-2' })
          .mockResolvedValueOnce({ id: 'task-3' }),
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { title: 'Task 1' }, as: 't1' },
        { insert: 'tasks', data: { title: 'Task 2' }, as: 't2' },
        { insert: 'tasks', data: { title: 'Task 3' }, as: 't3' },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(executor.insert).toHaveBeenCalledTimes(3);
      expect(result.aliases.entries().size).toBe(3);
    });
  });

  describe('process steps', () => {
    it('should execute process step', async () => {
      const executor = createMockExecutor({
        insert: vi.fn().mockResolvedValue({ id: 'reminder-1' }),
        process: vi.fn().mockResolvedValue({ success: true, id: 'reminder-1' }),
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'reminders', data: { text: 'Test' }, as: 'myReminder' },
        { process: 'execute', id: '$myReminder' },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(executor.process).toHaveBeenCalledWith('execute', 'reminder-1');
    });

    it('should fail when process returns unsuccessful result', async () => {
      const executor = createMockExecutor({
        insert: vi.fn().mockResolvedValue({ id: 'reminder-1' }),
        process: vi.fn().mockResolvedValue({ success: false, message: 'Processing failed' }),
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'reminders', data: { text: 'Test' }, as: 'myReminder' },
        { process: 'execute', id: '$myReminder' },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process');
      expect(result.failedStepIndex).toBe(1);
    });

    it('should fail when process is not implemented', async () => {
      const executor = createMockExecutor({
        insert: vi.fn().mockResolvedValue({ id: 'reminder-1' }),
        // process not implemented
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'reminders', data: { text: 'Test' }, as: 'myReminder' },
        { process: 'execute', id: '$myReminder' },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Process action not supported');
    });
  });

  describe('error handling', () => {
    it('should handle insert step failure', async () => {
      const executor = createMockExecutor({
        insert: vi.fn().mockRejectedValue(new Error('Database error')),
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { title: 'Test' } },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
      expect(result.failedStepIndex).toBe(0);
    });

    it('should handle alias resolution failure', async () => {
      const executor = createMockExecutor();
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { listId: '$unknownAlias' } },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown alias');
    });

    it('should return aliases created before failure', async () => {
      const executor = createMockExecutor({
        insert: vi.fn()
          .mockResolvedValueOnce({ id: 'task-1' })
          .mockRejectedValueOnce(new Error('Failed')),
      });
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { title: 'Task 1' }, as: 'task1' },
        { insert: 'tasks', data: { title: 'Task 2' }, as: 'task2' },
      ];

      const result = await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.aliases.has('task1')).toBe(true);
      expect(result.aliases.has('task2')).toBe(false);
    });
  });

  describe('verbose logging', () => {
    it('should log when verbose is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const executor = createMockExecutor();
      const steps: ScenarioSetupStep[] = [
        { insert: 'tasks', data: { title: 'Test' }, as: 'myTask' },
      ];

      await runSetupSteps({
        executor,
        steps,
        userId: 'user-1',
        verbose: true,
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('Setup');

      consoleSpy.mockRestore();
    });
  });
});
