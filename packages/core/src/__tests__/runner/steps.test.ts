/**
 * Step Executor Tests
 *
 * Tests for chat, verify, wait, and setup step executors.
 * These tests focus on the orchestration logic, mocking adapters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext } from '../../runner/context.js';
import { executeChatStep } from '../../runner/steps/chat.js';
import { executeVerifyStep } from '../../runner/steps/verify.js';
import { executeSetupStep } from '../../runner/steps/setup.js';
import type { AgentAdapter, DatabaseAdapter, AgentResponse } from '../../adapters/types.js';
import type { ChatStep, VerifyStep, InlineSetupStep } from '../../scenario/types.js';

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

function createContext(
  agentOverrides: Partial<AgentAdapter> = {},
  dbOverrides: Partial<DatabaseAdapter> = {},
  contextOptions: { verbose?: boolean } = {}
): ExecutionContext {
  return new ExecutionContext({
    userId: 'user-123',
    agent: createMockAgentAdapter(agentOverrides),
    database: createMockDatabaseAdapter(dbOverrides),
    verbose: contextOptions.verbose ?? false,
  });
}

// =============================================================================
// executeChatStep Tests
// =============================================================================

describe('executeChatStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic execution', () => {
    it('should send message to agent', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Response',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const context = createContext({ chat: chatMock });
      const step: ChatStep = { chat: 'Hello world' };

      await executeChatStep({ step, context, index: 0 });

      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Hello world',
        userId: 'user-123',
      }));
    });

    it('should return passed status on success', async () => {
      const context = createContext();
      const step: ChatStep = { chat: 'Hello' };

      const result = await executeChatStep({ step, context, index: 0 });

      expect(result.status).toBe('passed');
      expect(result.type).toBe('chat');
    });

    it('should include response and tool calls in report', async () => {
      const context = createContext({
        chat: vi.fn().mockResolvedValue({
          text: 'Created task',
          toolCalls: [{ name: 'createTask', args: { title: 'Test' } }],
          conversationId: 'conv-1',
        }),
      });
      const step: ChatStep = { chat: 'Create a task' };

      const result = await executeChatStep({ step, context, index: 0 });

      expect(result.response).toBe('Created task');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].name).toBe('createTask');
    });

    it('should update context conversation ID', async () => {
      const context = createContext({
        chat: vi.fn().mockResolvedValue({
          text: 'Done',
          toolCalls: [],
          conversationId: 'new-conv-id',
        }),
      });
      const step: ChatStep = { chat: 'Hello' };

      await executeChatStep({ step, context, index: 0 });

      expect(context.conversationId).toBe('new-conv-id');
    });

    it('should add token usage to context', async () => {
      const context = createContext({
        chat: vi.fn().mockResolvedValue({
          text: 'Done',
          toolCalls: [],
          conversationId: 'conv-1',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }),
      });
      const step: ChatStep = { chat: 'Hello' };

      await executeChatStep({ step, context, index: 0 });

      expect(context.getUsage().totalTokens).toBe(150);
    });
  });

  describe('conversation continuation', () => {
    it('should use existing conversation ID with continueConversation', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const context = createContext({ chat: chatMock });
      context.conversationId = 'existing-conv';
      const step: ChatStep = { chat: 'Continue', continueConversation: true };

      await executeChatStep({ step, context, index: 0 });

      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'existing-conv',
      }));
    });
  });

  describe('named conversations', () => {
    it('should create new conversation on first use of name', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'new-conv-abc',
      });
      const context = createContext({ chat: chatMock });
      const step: ChatStep = { chat: 'Hello', conversation: 'conv1' };

      await executeChatStep({ step, context, index: 0 });

      // Should send undefined (no existing conversation)
      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: undefined,
      }));
      // Should store the returned conversation ID under the name
      expect(context.getConversation('conv1')).toBe('new-conv-abc');
    });

    it('should reuse conversation ID on second use of same name', async () => {
      const chatMock = vi.fn()
        .mockResolvedValueOnce({
          text: 'First',
          toolCalls: [],
          conversationId: 'stored-conv-id',
        })
        .mockResolvedValueOnce({
          text: 'Second',
          toolCalls: [],
          conversationId: 'stored-conv-id',
        });
      const context = createContext({ chat: chatMock });

      // First step creates the conversation
      await executeChatStep({
        step: { chat: 'First message', conversation: 'conv1' },
        context,
        index: 0,
      });

      // Second step should reuse it
      await executeChatStep({
        step: { chat: 'Second message', conversation: 'conv1' },
        context,
        index: 1,
      });

      expect(chatMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        conversationId: 'stored-conv-id',
      }));
    });

    it('should track multiple independent conversations', async () => {
      const chatMock = vi.fn()
        .mockResolvedValueOnce({
          text: 'Conv1',
          toolCalls: [],
          conversationId: 'conv-aaa',
        })
        .mockResolvedValueOnce({
          text: 'Conv2',
          toolCalls: [],
          conversationId: 'conv-bbb',
        })
        .mockResolvedValueOnce({
          text: 'Conv1 again',
          toolCalls: [],
          conversationId: 'conv-aaa',
        });
      const context = createContext({ chat: chatMock });

      // Step 1: conv1
      await executeChatStep({
        step: { chat: 'Message 1', conversation: 'conv1' },
        context,
        index: 0,
      });

      // Step 2: conv2 (different conversation)
      await executeChatStep({
        step: { chat: 'Message 2', conversation: 'conv2' },
        context,
        index: 1,
      });

      // Step 3: back to conv1
      await executeChatStep({
        step: { chat: 'Message 3', conversation: 'conv1' },
        context,
        index: 2,
      });

      // Third call should use conv1's ID
      expect(chatMock).toHaveBeenNthCalledWith(3, expect.objectContaining({
        conversationId: 'conv-aaa',
      }));
    });

    it('should use undefined conversationId when no conversation field', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'new-conv',
      });
      const context = createContext({ chat: chatMock });
      const step: ChatStep = { chat: 'Hello' };

      await executeChatStep({ step, context, index: 0 });

      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: undefined,
      }));
    });

    it('should prioritize conversation over continueConversation', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'new-conv',
      });
      const context = createContext({ chat: chatMock });
      context.conversationId = 'existing-conv';
      const step: ChatStep = {
        chat: 'Hello',
        conversation: 'conv1',
        continueConversation: true, // Should be ignored when conversation is set
      };

      await executeChatStep({ step, context, index: 0 });

      // Should send undefined (new named conversation), not existing-conv
      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: undefined,
      }));
    });
  });

  describe('variable resolution', () => {
    it('should resolve $userId in message', async () => {
      const chatMock = vi.fn().mockResolvedValue({
        text: 'Done',
        toolCalls: [],
        conversationId: 'conv-1',
      });
      const context = createContext({ chat: chatMock });
      const step: ChatStep = { chat: 'User is $userId' };

      await executeChatStep({ step, context, index: 0 });

      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User is user-123',
      }));
    });
  });

  describe('error handling', () => {
    it('should return error status when agent throws', async () => {
      const context = createContext({
        chat: vi.fn().mockRejectedValue(new Error('Network error')),
      });
      const step: ChatStep = { chat: 'Hello' };

      const result = await executeChatStep({ step, context, index: 0 });

      expect(result.status).toBe('error');
      expect(result.error).toContain('Network error');
    });
  });

  describe('assertions', () => {
    it('should pass when expected tool is called', async () => {
      const context = createContext({
        chat: vi.fn().mockResolvedValue({
          text: 'Done',
          toolCalls: [{ name: 'createTask', args: { title: 'Test' } }],
          conversationId: 'conv-1',
        }),
      });
      const step: ChatStep = {
        chat: 'Create a task',
        tools: [{ name: 'createTask' }],
      };

      const result = await executeChatStep({ step, context, index: 0 });

      expect(result.status).toBe('passed');
    });

    it('should fail when wrong tool is called', async () => {
      const context = createContext({
        chat: vi.fn().mockResolvedValue({
          text: 'Done',
          toolCalls: [{ name: 'deleteTask', args: {} }],
          conversationId: 'conv-1',
        }),
      });
      const step: ChatStep = {
        chat: 'Create a task',
        tools: [{ name: 'createTask', args: { title: 'Test' } }],
      };

      const result = await executeChatStep({ step, context, index: 0 });

      // Should fail because createTask wasn't called with expected args
      expect(result.assertions.length).toBeGreaterThan(0);
    });

    it('should pass response assertion', async () => {
      const context = createContext({
        chat: vi.fn().mockResolvedValue({
          text: 'Task created successfully',
          toolCalls: [],
          conversationId: 'conv-1',
        }),
      });
      const step: ChatStep = {
        chat: 'Create a task',
        response: { contains: 'created' },
      };

      const result = await executeChatStep({ step, context, index: 0 });

      expect(result.status).toBe('passed');
    });

    it('should fail response assertion', async () => {
      const context = createContext({
        chat: vi.fn().mockResolvedValue({
          text: 'Error occurred',
          toolCalls: [],
          conversationId: 'conv-1',
        }),
      });
      const step: ChatStep = {
        chat: 'Create a task',
        response: { contains: 'created' },
      };

      const result = await executeChatStep({ step, context, index: 0 });

      expect(result.status).toBe('failed');
    });
  });
});

// =============================================================================
// executeVerifyStep Tests
// =============================================================================

describe('executeVerifyStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic execution', () => {
    it('should verify entity exists', async () => {
      const context = createContext({}, {
        findByTitle: vi.fn().mockResolvedValue({
          found: true,
          entity: { id: 'task-1', title: 'My Task', status: 'pending' },
        }),
      });
      const step: VerifyStep = {
        verify: {
          tasks: [{ title: 'My Task', fields: { status: 'pending' } }],
        },
      };

      const result = await executeVerifyStep({ step, context, index: 0 });

      expect(result.status).toBe('passed');
      expect(result.type).toBe('verify');
    });

    it('should count entities verified', async () => {
      const context = createContext({}, {
        findByTitle: vi.fn().mockResolvedValue({
          found: true,
          entity: { id: 'e-1', title: 'Test' },
        }),
      });
      const step: VerifyStep = {
        verify: {
          tasks: [
            { title: 'Task 1', fields: {} },
            { title: 'Task 2', fields: {} },
          ],
        },
      };

      const result = await executeVerifyStep({ step, context, index: 0 });

      expect(result.entitiesVerified).toBe(2);
    });

    it('should fail when entity not found', async () => {
      const context = createContext({}, {
        findByTitle: vi.fn().mockResolvedValue({ found: false, entity: null }),
      });
      const step: VerifyStep = {
        verify: {
          tasks: [{ title: 'Missing', fields: {} }],
        },
      };

      const result = await executeVerifyStep({ step, context, index: 0 });

      expect(result.status).toBe('failed');
    });

    it('should fail when fields do not match', async () => {
      const context = createContext({}, {
        findByTitle: vi.fn().mockResolvedValue({
          found: true,
          entity: { id: 'task-1', title: 'Task', status: 'completed' },
        }),
      });
      const step: VerifyStep = {
        verify: {
          tasks: [{ title: 'Task', fields: { status: 'pending' } }],
        },
      };

      const result = await executeVerifyStep({ step, context, index: 0 });

      expect(result.status).toBe('failed');
    });
  });

  describe('error handling', () => {
    it('should return error status when database throws', async () => {
      const context = createContext({}, {
        findByTitle: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      const step: VerifyStep = {
        verify: {
          tasks: [{ title: 'Test', fields: {} }],
        },
      };

      const result = await executeVerifyStep({ step, context, index: 0 });

      expect(result.status).toBe('error');
      expect(result.error).toContain('DB error');
    });
  });
});

// =============================================================================
// executeSetupStep Tests
// =============================================================================

describe('executeSetupStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic execution', () => {
    it('should insert entities', async () => {
      const insertMock = vi.fn().mockResolvedValue({ id: 'new-task-1' });
      const context = createContext({}, { insert: insertMock });
      const step: InlineSetupStep = {
        setup: [{ entity: 'tasks', data: { title: 'Test Task' } }],
      };

      const result = await executeSetupStep({ step, context, index: 0 });

      expect(result.status).toBe('passed');
      expect(result.type).toBe('setup');
      expect(insertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({
        title: 'Test Task',
      }));
    });

    it('should count entities inserted', async () => {
      const context = createContext({}, {
        insert: vi.fn().mockResolvedValue({ id: 'new-id' }),
      });
      const step: InlineSetupStep = {
        setup: [
          { entity: 'tasks', data: { title: 'Task 1' } },
          { entity: 'tasks', data: { title: 'Task 2' } },
        ],
      };

      const result = await executeSetupStep({ step, context, index: 0 });

      expect(result.entitiesInserted).toBe(2);
    });

    it('should create aliases', async () => {
      const context = createContext({}, {
        insert: vi.fn().mockResolvedValue({ id: 'task-123' }),
        findById: vi.fn().mockResolvedValue({
          found: true,
          entity: { id: 'task-123', title: 'Test' },
        }),
      });
      const step: InlineSetupStep = {
        setup: [{ entity: 'tasks', data: { title: 'Test' }, as: 'myTask' }],
      };

      const result = await executeSetupStep({ step, context, index: 0 });

      expect(result.aliasesCreated).toContain('myTask');
      expect(context.hasAlias('myTask')).toBe(true);
    });
  });

  describe('alias resolution', () => {
    it('should resolve $alias references', async () => {
      const insertMock = vi.fn().mockResolvedValue({ id: 'new-id' });
      const context = createContext({}, { insert: insertMock });
      context.setAlias('myList', { id: 'list-123', type: 'lists' });
      const step: InlineSetupStep = {
        setup: [{ entity: 'tasks', data: { title: 'Test', listId: '$myList' } }],
      };

      await executeSetupStep({ step, context, index: 0 });

      expect(insertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({
        listId: 'list-123',
      }));
    });

    it('should resolve $userId', async () => {
      const insertMock = vi.fn().mockResolvedValue({ id: 'new-id' });
      const context = createContext({}, { insert: insertMock });
      const step: InlineSetupStep = {
        setup: [{ entity: 'tasks', data: { title: 'Test', ownerId: '$userId' } }],
      };

      await executeSetupStep({ step, context, index: 0 });

      expect(insertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({
        ownerId: 'user-123',
      }));
    });
  });

  describe('user ID injection', () => {
    it('should auto-inject userId for user-scoped entities', async () => {
      const insertMock = vi.fn().mockResolvedValue({ id: 'new-id' });
      const context = createContext({}, {
        insert: insertMock,
        getSchema: vi.fn().mockReturnValue({
          name: 'tasks',
          tableName: 'tasks',
          userIdColumn: 'userId',
          columns: ['id', 'title', 'userId'],
        }),
      });
      const step: InlineSetupStep = {
        setup: [{ entity: 'tasks', data: { title: 'Test' } }],
      };

      await executeSetupStep({ step, context, index: 0 });

      expect(insertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({
        userId: 'user-123',
      }));
    });
  });

  describe('error handling', () => {
    it('should return error status when insert fails', async () => {
      const context = createContext({}, {
        insert: vi.fn().mockRejectedValue(new Error('Insert failed')),
      });
      const step: InlineSetupStep = {
        setup: [{ entity: 'tasks', data: { title: 'Test' } }],
      };

      const result = await executeSetupStep({ step, context, index: 0 });

      expect(result.status).toBe('error');
      expect(result.error).toContain('Insert failed');
    });
  });
});
