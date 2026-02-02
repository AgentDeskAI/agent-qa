/**
 * Tests for Parallel Runner
 *
 * Tests edge cases for parallel scenario execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  executeParallel,
  toSuiteReport,
  filterScenariosForParallel,
  type ParallelRunOptions,
  type ParallelLifecycleHooks,
  type ParallelRunResult,
} from '../../runner/parallel-runner.js';
import type { Scenario } from '../../scenario/types.js';
import type { ScenarioReport } from '../../runner/types.js';
import type { TestRunner } from '../../runner/runner.js';

// Helper to create mock scenarios
function createMockScenario(id: string, name?: string): Scenario {
  return {
    id,
    name: name ?? id,
    steps: [{ type: 'chat' as const, message: 'test', label: 'test-step' }],
  };
}

// Helper to create mock runner
function createMockTestRunner(results: Map<string, { passed: boolean; error?: string }>): TestRunner {
  return {
    runScenario: async (scenario: Scenario, options?: { userId?: string; verbose?: boolean }): Promise<ScenarioReport> => {
      const result = results.get(scenario.id) ?? { passed: true };

      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 10));

      return {
        id: scenario.id,
        name: scenario.name ?? scenario.id,
        status: result.passed ? 'passed' : 'failed',
        steps: [],
        durationMs: 100,
        captured: {},
        error: result.error,
      };
    },
    runSuite: vi.fn(),
  } as unknown as TestRunner;
}

describe('executeParallel', () => {
  describe('basic execution', () => {
    it('should run all scenarios with specified concurrency', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
        createMockScenario('test-3'),
      ];
      const runner = createMockTestRunner(new Map());

      const result = await executeParallel(runner, scenarios, {
        concurrency: 2,
        isolateUsers: true,
      });

      expect(result.reports).toHaveLength(3);
      expect(result.reports.every((r) => r.status === 'passed')).toBe(true);
      expect(result.passed).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should handle more workers than scenarios', async () => {
      const scenarios = [createMockScenario('test-1')];
      const runner = createMockTestRunner(new Map());

      const result = await executeParallel(runner, scenarios, {
        concurrency: 10, // More workers than scenarios
        isolateUsers: true,
      });

      expect(result.reports).toHaveLength(1);
      expect(result.passed).toBe(1);
    });

    it('should handle empty scenario list', async () => {
      const runner = createMockTestRunner(new Map());

      const result = await executeParallel(runner, [], {
        concurrency: 2,
        isolateUsers: true,
      });

      expect(result.reports).toHaveLength(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should continue other scenarios when one fails', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
        createMockScenario('test-3'),
      ];
      const runner = createMockTestRunner(
        new Map([['test-2', { passed: false, error: 'Intentional failure' }]])
      );

      const result = await executeParallel(runner, scenarios, {
        concurrency: 3,
        isolateUsers: true,
      });

      expect(result.reports).toHaveLength(3);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(1);

      const failedResult = result.reports.find((r) => r.id === 'test-2');
      expect(failedResult?.status).toBe('failed');
      expect(failedResult?.error).toBe('Intentional failure');
    });

    it('should handle all scenarios failing', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
      ];
      const runner = createMockTestRunner(
        new Map([
          ['test-1', { passed: false, error: 'Error 1' }],
          ['test-2', { passed: false, error: 'Error 2' }],
        ])
      );

      const result = await executeParallel(runner, scenarios, {
        concurrency: 2,
        isolateUsers: true,
      });

      expect(result.reports).toHaveLength(2);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(2);
    });

    it('should handle runner throwing an exception', async () => {
      const scenarios = [createMockScenario('test-1')];
      const runner = {
        runScenario: async (): Promise<ScenarioReport> => {
          throw new Error('Runner crashed');
        },
        runSuite: vi.fn(),
      } as unknown as TestRunner;

      const result = await executeParallel(runner, scenarios, {
        concurrency: 1,
        isolateUsers: true,
      });

      expect(result.reports).toHaveLength(1);
      expect(result.failed).toBe(1);
      expect(result.reports[0].status).toBe('failed');
      expect(result.reports[0].error).toContain('Runner crashed');
    });
  });

  describe('lifecycle hooks', () => {
    it('should call beforeEach with userId for each scenario', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
      ];
      const runner = createMockTestRunner(new Map());

      const beforeEachCalls: Array<{ scenarioId: string; userId: string }> = [];
      const hooks: ParallelLifecycleHooks = {
        beforeEach: async (scenario, context) => {
          beforeEachCalls.push({
            scenarioId: scenario.id,
            userId: context.userId,
          });
        },
      };

      await executeParallel(runner, scenarios, {
        concurrency: 2,
        isolateUsers: true,
        hooks,
      });

      expect(beforeEachCalls).toHaveLength(2);
      // Each scenario should have a unique userId
      expect(beforeEachCalls[0].userId).not.toBe(beforeEachCalls[1].userId);
    });

    it('should call afterEach with result for each scenario', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
      ];
      const runner = createMockTestRunner(
        new Map([['test-2', { passed: false, error: 'Failed' }]])
      );

      const afterEachCalls: Array<{ scenarioId: string; passed: boolean }> = [];
      const hooks: ParallelLifecycleHooks = {
        afterEach: async (scenario, result, _context) => {
          afterEachCalls.push({
            scenarioId: scenario.id,
            passed: result.passed,
          });
        },
      };

      await executeParallel(runner, scenarios, {
        concurrency: 2,
        isolateUsers: true,
        hooks,
      });

      expect(afterEachCalls).toHaveLength(2);
      expect(afterEachCalls.find((c) => c.scenarioId === 'test-1')?.passed).toBe(true);
      expect(afterEachCalls.find((c) => c.scenarioId === 'test-2')?.passed).toBe(false);
    });

    it('should continue execution when beforeEach throws', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
      ];
      const runner = createMockTestRunner(new Map());

      let hookCallCount = 0;
      const hooks: ParallelLifecycleHooks = {
        beforeEach: async (scenario, _context) => {
          hookCallCount++;
          if (scenario.id === 'test-1') {
            throw new Error('Hook failed');
          }
        },
      };

      const result = await executeParallel(runner, scenarios, {
        concurrency: 2,
        isolateUsers: true,
        hooks,
      });

      // Both hooks should have been called
      expect(hookCallCount).toBe(2);
      // test-1 should fail due to hook error, test-2 should pass
      expect(result.failed).toBe(1);
      expect(result.passed).toBe(1);
    });

    it('should call afterEach even when scenario fails', async () => {
      const scenarios = [createMockScenario('test-1')];
      const runner = createMockTestRunner(
        new Map([['test-1', { passed: false, error: 'Failed' }]])
      );

      let afterEachCalled = false;
      const hooks: ParallelLifecycleHooks = {
        afterEach: async () => {
          afterEachCalled = true;
        },
      };

      await executeParallel(runner, scenarios, {
        concurrency: 1,
        isolateUsers: true,
        hooks,
      });

      expect(afterEachCalled).toBe(true);
    });
  });

  describe('concurrent hook race conditions', () => {
    it('should maintain correct userId association when hooks run concurrently', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
        createMockScenario('test-3'),
        createMockScenario('test-4'),
      ];
      const runner = createMockTestRunner(new Map());

      // Track which userId was received by each scenario's hook
      const hookAssociations: Map<string, string> = new Map();

      const hooks: ParallelLifecycleHooks = {
        beforeEach: async (scenario, context) => {
          // Simulate async work with random delay to create race conditions
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
          hookAssociations.set(scenario.id, context.userId);
        },
      };

      await executeParallel(runner, scenarios, {
        concurrency: 4, // All run concurrently
        isolateUsers: true,
        hooks,
      });

      // Each scenario should have a unique userId
      const userIds = Array.from(hookAssociations.values());
      const uniqueUserIds = new Set(userIds);
      expect(uniqueUserIds.size).toBe(4);

      // Verify each scenario got a different userId
      expect(hookAssociations.get('test-1')).not.toBe(hookAssociations.get('test-2'));
      expect(hookAssociations.get('test-2')).not.toBe(hookAssociations.get('test-3'));
      expect(hookAssociations.get('test-3')).not.toBe(hookAssociations.get('test-4'));
    });

    it('should not leak state between concurrent hooks', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
        createMockScenario('test-3'),
      ];
      const runner = createMockTestRunner(new Map());

      // Shared array to detect potential state leakage
      const executionLog: Array<{ phase: string; scenarioId: string; userId: string }> = [];

      const hooks: ParallelLifecycleHooks = {
        beforeEach: async (scenario, context) => {
          executionLog.push({ phase: 'beforeEach-start', scenarioId: scenario.id, userId: context.userId });
          // Simulate varying execution times
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 30));
          executionLog.push({ phase: 'beforeEach-end', scenarioId: scenario.id, userId: context.userId });
        },
        afterEach: async (scenario, _result, context) => {
          executionLog.push({ phase: 'afterEach-start', scenarioId: scenario.id, userId: context.userId });
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
          executionLog.push({ phase: 'afterEach-end', scenarioId: scenario.id, userId: context.userId });
        },
      };

      await executeParallel(runner, scenarios, {
        concurrency: 3,
        isolateUsers: true,
        hooks,
      });

      // Verify each scenario's hooks maintain consistent userId throughout
      for (const scenarioId of ['test-1', 'test-2', 'test-3']) {
        const scenarioLogs = executionLog.filter((log) => log.scenarioId === scenarioId);
        const userIds = scenarioLogs.map((log) => log.userId);
        const uniqueUserIds = new Set(userIds);
        // All log entries for a scenario should have the same userId
        expect(uniqueUserIds.size).toBe(1);
      }
    });

    it('should correctly associate afterEach results when scenarios complete out of order', async () => {
      const scenarios = [
        createMockScenario('slow-pass'),
        createMockScenario('fast-fail'),
        createMockScenario('medium-pass'),
      ];

      // slow-pass takes longest but passes, fast-fail fails quickly
      const runner = {
        runScenario: async (scenario: Scenario): Promise<ScenarioReport> => {
          if (scenario.id === 'slow-pass') {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { id: scenario.id, name: scenario.name, status: 'passed', steps: [], durationMs: 50, captured: {} };
          } else if (scenario.id === 'fast-fail') {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { id: scenario.id, name: scenario.name, status: 'failed', steps: [], durationMs: 5, captured: {}, error: 'Fast failure' };
          } else {
            await new Promise((resolve) => setTimeout(resolve, 25));
            return { id: scenario.id, name: scenario.name, status: 'passed', steps: [], durationMs: 25, captured: {} };
          }
        },
        runSuite: vi.fn(),
      } as unknown as TestRunner;

      const afterEachResults: Array<{ scenarioId: string; passed: boolean }> = [];

      const hooks: ParallelLifecycleHooks = {
        afterEach: async (scenario, result, _context) => {
          afterEachResults.push({ scenarioId: scenario.id, passed: result.passed });
        },
      };

      await executeParallel(runner, scenarios, {
        concurrency: 3,
        isolateUsers: true,
        hooks,
      });

      // Verify each scenario got the correct result, regardless of completion order
      expect(afterEachResults.find((r) => r.scenarioId === 'slow-pass')?.passed).toBe(true);
      expect(afterEachResults.find((r) => r.scenarioId === 'fast-fail')?.passed).toBe(false);
      expect(afterEachResults.find((r) => r.scenarioId === 'medium-pass')?.passed).toBe(true);
    });

    it('should handle concurrent hook failures without affecting other scenarios', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2-hook-fails'),
        createMockScenario('test-3'),
        createMockScenario('test-4-hook-fails'),
        createMockScenario('test-5'),
      ];
      const runner = createMockTestRunner(new Map());

      const completedScenarios: string[] = [];

      const hooks: ParallelLifecycleHooks = {
        beforeEach: async (scenario, _context) => {
          // Hooks for test-2 and test-4 fail
          if (scenario.id.includes('hook-fails')) {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
            throw new Error(`Hook failed for ${scenario.id}`);
          }
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
        },
        afterEach: async (scenario, _result, _context) => {
          completedScenarios.push(scenario.id);
        },
      };

      const result = await executeParallel(runner, scenarios, {
        concurrency: 5,
        isolateUsers: true,
        hooks,
      });

      // 2 scenarios should fail (hook failures), 3 should pass
      expect(result.failed).toBe(2);
      expect(result.passed).toBe(3);

      // All 5 scenarios should have afterEach called (even failed ones)
      expect(completedScenarios).toHaveLength(5);
      expect(completedScenarios).toContain('test-1');
      expect(completedScenarios).toContain('test-2-hook-fails');
      expect(completedScenarios).toContain('test-3');
      expect(completedScenarios).toContain('test-4-hook-fails');
      expect(completedScenarios).toContain('test-5');
    });

    it('should maintain isolation when hooks modify shared external state', async () => {
      const scenarios = Array.from({ length: 10 }, (_, i) => createMockScenario(`test-${i}`));
      const runner = createMockTestRunner(new Map());

      // Simulate a shared "database" that hooks write to
      const sharedState: Map<string, { scenarioId: string; userId: string; timestamp: number }> = new Map();

      const hooks: ParallelLifecycleHooks = {
        beforeEach: async (scenario, context) => {
          // Each hook writes to shared state
          const timestamp = Date.now();
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 30));
          sharedState.set(context.userId, { scenarioId: scenario.id, userId: context.userId, timestamp });
        },
      };

      await executeParallel(runner, scenarios, {
        concurrency: 10,
        isolateUsers: true,
        hooks,
      });

      // Each userId should map to exactly one scenario (no overwrites from concurrent access)
      expect(sharedState.size).toBe(10);

      // Verify each entry correctly associates scenario with its userId
      const scenarioIds = new Set(Array.from(sharedState.values()).map((v) => v.scenarioId));
      expect(scenarioIds.size).toBe(10);
    });
  });

  describe('user isolation', () => {
    it('should use unique userIds when isolateUsers is true', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
      ];

      const userIds: string[] = [];
      const runner = {
        runScenario: async (
          scenario: Scenario,
          options?: { userId?: string; verbose?: boolean }
        ): Promise<ScenarioReport> => {
          userIds.push(options?.userId ?? 'unknown');
          return {
            id: scenario.id,
            name: scenario.name ?? scenario.id,
            status: 'passed',
            steps: [],
            durationMs: 100,
            captured: {},
          };
        },
        runSuite: vi.fn(),
      } as unknown as TestRunner;

      await executeParallel(runner, scenarios, {
        concurrency: 2,
        isolateUsers: true,
      });

      expect(userIds).toHaveLength(2);
      expect(userIds[0]).not.toBe(userIds[1]);
      // Should be UUIDs
      expect(userIds[0]).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('should use default userId when isolateUsers is false', async () => {
      const scenarios = [
        createMockScenario('test-1'),
        createMockScenario('test-2'),
      ];

      const defaultUserId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const userIds: string[] = [];
      const runner = {
        runScenario: async (
          scenario: Scenario,
          options?: { userId?: string; verbose?: boolean }
        ): Promise<ScenarioReport> => {
          userIds.push(options?.userId ?? 'unknown');
          return {
            id: scenario.id,
            name: scenario.name ?? scenario.id,
            status: 'passed',
            steps: [],
            durationMs: 100,
            captured: {},
          };
        },
        runSuite: vi.fn(),
      } as unknown as TestRunner;

      await executeParallel(runner, scenarios, {
        concurrency: 2,
        isolateUsers: false,
        defaultUserId,
      });

      expect(userIds).toHaveLength(2);
      expect(userIds[0]).toBe(defaultUserId);
      expect(userIds[1]).toBe(defaultUserId);
    });
  });
});

describe('toSuiteReport', () => {
  it('should convert parallel result to suite report format', () => {
    const parallelResult: ParallelRunResult = {
      reports: [
        {
          id: 'test-1',
          name: 'Test 1',
          status: 'passed' as const,
          steps: [],
          durationMs: 100,
          captured: {},
        },
        {
          id: 'test-2',
          name: 'Test 2',
          status: 'failed' as const,
          steps: [],
          durationMs: 200,
          captured: {},
          error: 'Test failed',
        },
      ],
      passed: 1,
      failed: 1,
      totalDurationMs: 300,
      success: false,
      bailed: false,
      userIsolation: {
        getUserId: () => 'test-user',
        getContext: () => undefined,
        markCreated: () => {},
        getCreatedContexts: () => [],
        clear: () => {},
        isEnabled: () => true,
        getDefaultUserId: () => 'test-user',
      } as any,
    };

    const suiteReport = toSuiteReport('Test Suite', parallelResult);

    expect(suiteReport.name).toBe('Test Suite');
    expect(suiteReport.scenarios).toHaveLength(2);
    expect(suiteReport.total).toBe(2);
    expect(suiteReport.passed).toBe(1);
    expect(suiteReport.failed).toBe(1);
  });
});

describe('filterScenariosForParallel', () => {
  it('should filter scenarios by ID', () => {
    const scenarios = [
      createMockScenario('test-1'),
      createMockScenario('test-2'),
      createMockScenario('test-3'),
    ];

    const filtered = filterScenariosForParallel(scenarios, { id: 'test-2' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('test-2');
  });

  it('should filter scenarios by tags', () => {
    const scenarios = [
      { ...createMockScenario('test-1'), tags: ['smoke'] },
      { ...createMockScenario('test-2'), tags: ['integration'] },
      { ...createMockScenario('test-3'), tags: ['smoke', 'fast'] },
    ];

    const filtered = filterScenariosForParallel(scenarios, { tags: ['smoke'] });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.id)).toEqual(['test-1', 'test-3']);
  });

  it('should filter scenarios by grep pattern', () => {
    const scenarios = [
      createMockScenario('test-create-task', 'Create a task'),
      createMockScenario('test-delete-task', 'Delete a task'),
      createMockScenario('test-reminder', 'Create a reminder'),
    ];

    const filtered = filterScenariosForParallel(scenarios, { grep: 'task' });

    expect(filtered).toHaveLength(2);
  });

  it('should return all scenarios when no filter specified', () => {
    const scenarios = [
      createMockScenario('test-1'),
      createMockScenario('test-2'),
    ];

    const filtered = filterScenariosForParallel(scenarios, {});

    expect(filtered).toHaveLength(2);
  });
});
