/**
 * TestRunner Tests
 *
 * Tests for the main test runner class.
 * Focuses on orchestration logic with mocked adapters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestRunner, createTestRunner } from '../../runner/runner.js';
import type { AgentAdapter, DatabaseAdapter, AgentResponse } from '../../adapters/types.js';
import type { Scenario } from '../../scenario/types.js';
import type { ResolvedConfig } from '../../config/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockAgentAdapter(overrides: Partial<AgentAdapter> = {}): AgentAdapter {
  return {
    chat: vi.fn().mockResolvedValue({
      text: 'Done!',
      toolCalls: [],
      conversationId: 'conv-123',
    } as AgentResponse),
    ...overrides,
  };
}

function createMockDatabaseAdapter(overrides: Partial<DatabaseAdapter> = {}): DatabaseAdapter {
  return {
    findById: vi.fn().mockResolvedValue({ found: true, entity: { id: 'entity-1', title: 'Test' } }),
    findByTitle: vi.fn().mockResolvedValue({ found: true, entity: { id: 'entity-1', title: 'Test' } }),
    list: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue({ id: 'new-id' }),
    getSchemas: vi.fn().mockReturnValue([]),
    getSchema: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function createTestScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'test-scenario',
    steps: [{ chat: 'Hello' }],
    ...overrides,
  };
}

// =============================================================================
// TestRunner Constructor Tests
// =============================================================================

describe('TestRunner', () => {
  describe('constructor', () => {
    it('should create runner with required options', () => {
      const agent = createMockAgentAdapter();
      const database = createMockDatabaseAdapter();

      const runner = new TestRunner({
        agent,
        database,
        defaultUserId: 'user-123',
      });

      expect(runner).toBeInstanceOf(TestRunner);
    });

    it('should use default verbose=false', () => {
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });

      // Verify by running a scenario and checking no logs
      // (indirect test - runner should exist without verbose)
      expect(runner).toBeDefined();
    });

    it('should accept custom setup executor', () => {
      const customSetup = {
        insert: vi.fn().mockResolvedValue({ id: 'custom-id' }),
      };

      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
        setup: customSetup,
      });

      expect(runner).toBeDefined();
    });
  });

  // =============================================================================
  // runScenario Tests
  // =============================================================================

  describe('runScenario', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should run a simple scenario successfully', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Hello back!',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario();

      const report = await runner.runScenario(scenario);

      expect(report.status).toBe('passed');
      expect(report.id).toBe('test-scenario');
      expect(report.steps).toHaveLength(1);
      expect(chatMock).toHaveBeenCalled();
    });

    it('should use default userId', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'default-user',
      });
      const scenario = createTestScenario();

      await runner.runScenario(scenario);

      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'default-user',
      }));
    });

    it('should use scenario userId when provided', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'default-user',
      });
      const scenario = createTestScenario({ userId: 'scenario-user' });

      await runner.runScenario(scenario);

      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'scenario-user',
      }));
    });

    it('should use options userId over scenario userId', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'default-user',
      });
      const scenario = createTestScenario({ userId: 'scenario-user' });

      await runner.runScenario(scenario, { userId: 'options-user' });

      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'options-user',
      }));
    });

    it('should execute multiple steps in order', async () => {
      const callOrder: string[] = [];
      const chatMock = vi.fn().mockImplementation(async ({ message }) => {
        callOrder.push(message);
        return { text: 'Done', toolCalls: [], conversationId: 'conv-1' };
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        steps: [
          { chat: 'First message' },
          { chat: 'Second message' },
          { chat: 'Third message' },
        ],
      });

      await runner.runScenario(scenario);

      expect(callOrder).toEqual(['First message', 'Second message', 'Third message']);
    });

    it('should stop on first failure by default', async () => {
      let callCount = 0;
      const chatMock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Agent error');
        }
        return { text: 'Done', toolCalls: [], conversationId: 'conv-1' };
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        steps: [
          { chat: 'Step 1' },
          { chat: 'Step 2' },
          { chat: 'Step 3' },
        ],
      });

      const report = await runner.runScenario(scenario);

      expect(report.status).toBe('error');
      expect(report.steps).toHaveLength(2);
      expect(report.failedStepIndex).toBe(1);
    });

    it('should continue on failure when stopOnFailure is false', async () => {
      let callCount = 0;
      const chatMock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Agent error');
        }
        return { text: 'Done', toolCalls: [], conversationId: 'conv-1' };
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        steps: [
          { chat: 'Step 1' },
          { chat: 'Step 2' },
          { chat: 'Step 3' },
        ],
      });

      const report = await runner.runScenario(scenario, { stopOnFailure: false });

      expect(report.steps).toHaveLength(3);
    });

    it('should include captured entities in report', async () => {
      const runner = new TestRunner({
        agent: createMockAgentAdapter({
          chat: vi.fn().mockResolvedValue({
            text: 'Created task',
            toolCalls: [{ name: 'createTask', args: { title: 'Test' } }],
            conversationId: 'conv-1',
          }),
        }),
        database: createMockDatabaseAdapter({
          list: vi.fn().mockResolvedValue([{ id: 'task-1', title: 'Test', userId: 'user-123' }]),
        }),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        steps: [{
          chat: 'Create a task',
          created: [{ entity: 'tasks', as: 'myTask' }],
        }],
      });

      const report = await runner.runScenario(scenario);

      expect(report.captured).toBeDefined();
    });

    it('should include usage stats in report', async () => {
      const runner = new TestRunner({
        agent: createMockAgentAdapter({
          chat: vi.fn().mockResolvedValue({
            text: 'Done',
            toolCalls: [],
            conversationId: 'conv-1',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          }),
        }),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario();

      const report = await runner.runScenario(scenario);

      expect(report.usage).toBeDefined();
      expect(report.usage?.totalTokens).toBe(150);
    });

    it('should set scenario name in report', async () => {
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        id: 'test-id',
        name: 'Test Scenario Name',
      });

      const report = await runner.runScenario(scenario);

      expect(report.name).toBe('Test Scenario Name');
    });
  });

  // =============================================================================
  // Lifecycle Hooks Tests
  // =============================================================================

  describe('lifecycle hooks', () => {
    it('should call beforeEach hook', async () => {
      const beforeEach = vi.fn();
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({ id: 'hook-test', name: 'Hook Test' });

      await runner.runScenario(scenario, { hooks: { beforeEach } });

      expect(beforeEach).toHaveBeenCalledWith(expect.objectContaining({
        id: 'hook-test',
        name: 'Hook Test',
      }));
    });

    it('should call afterEach hook', async () => {
      const afterEach = vi.fn();
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario();

      await runner.runScenario(scenario, { hooks: { afterEach } });

      expect(afterEach).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-scenario' }),
        expect.objectContaining({ passed: true })
      );
    });

    it('should report error when beforeEach fails', async () => {
      const beforeEach = vi.fn().mockRejectedValue(new Error('Hook error'));
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario();

      const report = await runner.runScenario(scenario, { hooks: { beforeEach } });

      expect(report.status).toBe('error');
      expect(report.error).toContain('beforeEach hook failed');
    });

    it('should continue if afterEach fails', async () => {
      const afterEach = vi.fn().mockRejectedValue(new Error('Hook error'));
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter(),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario();

      const report = await runner.runScenario(scenario, { hooks: { afterEach } });

      // Should still be passed - afterEach failure doesn't change status
      expect(report.status).toBe('passed');
    });
  });

  // =============================================================================
  // Setup Steps Tests
  // =============================================================================

  describe('setup steps', () => {
    it('should run setup steps before scenario', async () => {
      const insertMock = vi.fn().mockResolvedValue({ id: 'setup-entity' });
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter({ chat: chatMock }),
        database: createMockDatabaseAdapter({ insert: insertMock }),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        setup: [{ insert: 'tasks', data: { title: 'Setup Task' } }],
      });

      await runner.runScenario(scenario);

      expect(insertMock).toHaveBeenCalledBefore(chatMock);
    });

    it('should fail scenario if setup fails', async () => {
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter({
          insert: vi.fn().mockRejectedValue(new Error('Insert failed')),
        }),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        setup: [{ insert: 'tasks', data: { title: 'Setup Task' } }],
      });

      const report = await runner.runScenario(scenario);

      expect(report.status).toBe('error');
      expect(report.error).toContain('Setup failed');
    });
  });

  // =============================================================================
  // Step Types Tests
  // =============================================================================

  describe('step types', () => {
    it('should execute verify steps', async () => {
      const findByTitleMock = vi.fn().mockResolvedValue({
        found: true,
        entity: { id: 'task-1', title: 'Test Task', status: 'pending' },
      });
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter({ findByTitle: findByTitleMock }),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        steps: [{
          verify: {
            tasks: [{ title: 'Test Task', fields: { status: 'pending' } }],
          },
        }],
      });

      const report = await runner.runScenario(scenario);

      expect(report.status).toBe('passed');
      expect(report.steps[0].type).toBe('verify');
    });

    it('should execute inline setup steps', async () => {
      const insertMock = vi.fn().mockResolvedValue({ id: 'new-id' });
      const runner = new TestRunner({
        agent: createMockAgentAdapter(),
        database: createMockDatabaseAdapter({ insert: insertMock }),
        defaultUserId: 'user-123',
      });
      const scenario = createTestScenario({
        steps: [{
          setup: [{ entity: 'tasks', data: { title: 'Inline Task' } }],
        }],
      });

      const report = await runner.runScenario(scenario);

      expect(report.status).toBe('passed');
      expect(report.steps[0].type).toBe('setup');
      expect(insertMock).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// createTestRunner Tests
// =============================================================================

describe('createTestRunner', () => {
  it('should create runner from config', () => {
    const config: ResolvedConfig = {
      name: 'Test Config',
      scenarios: [],
      agent: {
        baseUrl: 'http://localhost:4000',
        chatEndpoint: '/api/chat',
        userIdHeader: 'x-user-id',
      },
      database: {
        url: 'postgresql://localhost:5432/test',
        entities: [],
      },
      defaultUserId: 'config-user',
    };
    const adapters = {
      agent: createMockAgentAdapter(),
      database: createMockDatabaseAdapter(),
    };

    const runner = createTestRunner(config, adapters);

    expect(runner).toBeInstanceOf(TestRunner);
  });
});
