/**
 * Wait Step Executor Tests
 *
 * Tests for the wait step executor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the modules before importing
vi.mock('../../../helpers/utils.js', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../assertions/index.js', () => ({
  executeWaitCondition: vi.fn().mockResolvedValue({
    passed: true,
    message: 'Condition met',
  }),
}));

import { executeWaitStep } from '../../../runner/steps/wait.js';
import type { WaitStep } from '../../../scenario/types.js';
import { ExecutionContext } from '../../../runner/context.js';
import { sleep } from '../../../helpers/utils.js';
import { executeWaitCondition } from '../../../assertions/index.js';
import type { AgentAdapter, DatabaseAdapter } from '../../../adapters/types.js';

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
    query: vi.fn().mockResolvedValue([]),
    getEntityConfig: vi.fn().mockReturnValue({
      name: 'tasks',
      table: {},
    }),
  };
}

function createContext(options: { verbose?: boolean } = {}): ExecutionContext {
  return new ExecutionContext({
    userId: 'user-123',
    agent: createMockAgentAdapter(),
    database: createMockDatabaseAdapter(),
    verbose: options.verbose ?? false,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('executeWaitStep', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('simple delay', () => {
    it('should wait for specified seconds', async () => {
      const step: WaitStep = {
        wait: { seconds: 2 },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(vi.mocked(sleep)).toHaveBeenCalledWith(2000);
      expect(result.status).toBe('passed');
      expect(result.waitedSeconds).toBe(2);
    });

    it('should return step report with correct type', async () => {
      const step: WaitStep = {
        wait: { seconds: 1 },
        label: 'delay-step',
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 3,
      });

      expect(result.type).toBe('wait');
      expect(result.index).toBe(3);
      expect(result.label).toBe('delay-step');
    });

    it('should log message in verbose mode', async () => {
      const step: WaitStep = {
        wait: { seconds: 5 },
      };
      const context = createContext({ verbose: true });

      await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('5s'));
    });

    it('should not log in non-verbose mode', async () => {
      const step: WaitStep = {
        wait: { seconds: 1 },
      };
      const context = createContext({ verbose: false });

      await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should track duration', async () => {
      const step: WaitStep = {
        wait: { seconds: 1 },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('condition wait', () => {
    it('should call executeWaitCondition for entity condition', async () => {
      const step: WaitStep = {
        wait: {
          entity: 'tasks',
          where: { title: 'Test' },
        },
      };
      const context = createContext();

      await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(vi.mocked(executeWaitCondition)).toHaveBeenCalled();
    });

    it('should pass timeout from step options', async () => {
      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
        timeoutSeconds: 60,
        intervalSeconds: 2,
      };
      const context = createContext();

      await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(vi.mocked(executeWaitCondition)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          timeoutMs: 60000,
          intervalMs: 2000,
        })
      );
    });

    it('should use default timeout when not specified', async () => {
      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(vi.mocked(executeWaitCondition)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          timeoutMs: expect.any(Number),
          intervalMs: expect.any(Number),
        })
      );
    });

    it('should return passed status when condition met', async () => {
      vi.mocked(executeWaitCondition).mockResolvedValueOnce({
        passed: true,
        message: 'Found entity',
      });

      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.status).toBe('passed');
      expect(result.error).toBeUndefined();
    });

    it('should return failed status when condition not met', async () => {
      vi.mocked(executeWaitCondition).mockResolvedValueOnce({
        passed: false,
        message: 'Timeout waiting for entity',
      });

      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Timeout waiting for entity');
    });

    it('should include assertion result', async () => {
      vi.mocked(executeWaitCondition).mockResolvedValueOnce({
        passed: true,
        message: 'Entity found',
      });

      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.assertions).toHaveLength(1);
      expect(result.assertions[0].passed).toBe(true);
    });

    it('should track poll attempts', async () => {
      // Mock to capture onPoll callback
      let capturedOnPoll: (() => void) | undefined;
      vi.mocked(executeWaitCondition).mockImplementationOnce(
        async (_cond, _db, _ctx, opts) => {
          capturedOnPoll = opts?.onPoll;
          // Simulate a few polls
          capturedOnPoll?.();
          capturedOnPoll?.();
          capturedOnPoll?.();
          return { passed: true, message: 'Found' };
        }
      );

      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.pollAttempts).toBe(3);
    });

    it('should log condition info in verbose mode', async () => {
      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
        timeoutSeconds: 30,
      };
      const context = createContext({ verbose: true });

      await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('tasks'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('30s'));
    });
  });

  describe('error handling', () => {
    it('should catch and report errors', async () => {
      vi.mocked(executeWaitCondition).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('Database connection failed');
    });

    it('should handle non-Error throws', async () => {
      vi.mocked(executeWaitCondition).mockRejectedValueOnce('Unknown error');

      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('Unknown error');
    });

    it('should still track duration on error', async () => {
      vi.mocked(executeWaitCondition).mockRejectedValueOnce(new Error('Fail'));

      const step: WaitStep = {
        wait: {
          entity: 'tasks',
        },
      };
      const context = createContext();

      const result = await executeWaitStep({
        step,
        context,
        index: 0,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
