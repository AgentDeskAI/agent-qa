/**
 * Parallel Runner
 *
 * Runs multiple scenarios concurrently with user isolation.
 * Uses p-limit for concurrency control.
 */

import pLimit from 'p-limit';

import type { TestRunner } from './runner.js';
import type { Scenario } from '../scenario/types.js';
import type { ScenarioReport, SuiteReport } from './types.js';
import type { ScenarioInfo, ScenarioResultInfo } from '../config/types.js';
import {
  UserIsolationManager,
  createUserIsolationManager,
} from './user-isolation.js';

/**
 * Extended lifecycle hooks that support user isolation context.
 */
export interface ParallelLifecycleHooks {
  /** Run before each scenario with user context */
  beforeEach?: (scenario: ScenarioInfo, context: { userId: string }) => Promise<void>;
  /** Run after each scenario with user context */
  afterEach?: (scenario: ScenarioInfo, result: ScenarioResultInfo, context: { userId: string }) => Promise<void>;
}

/**
 * Options for parallel execution.
 */
export interface ParallelRunOptions {
  /** Maximum number of concurrent scenarios (default: 4) */
  concurrency?: number;
  /** Enable user isolation (default: true) */
  isolateUsers?: boolean;
  /** Default user ID when isolation is disabled */
  defaultUserId?: string;
  /** Stop on first failure (default: false) */
  bail?: boolean;
  /** Lifecycle hooks with user context support */
  hooks?: ParallelLifecycleHooks;
  /** Verbose output */
  verbose?: boolean;
  /** Callback when a scenario starts */
  onScenarioStart?: (scenario: Scenario, index: number) => void;
  /** Callback when a scenario completes */
  onScenarioComplete?: (scenario: Scenario, result: ScenarioReport, index: number) => void;
}

/**
 * Result of parallel execution.
 */
export interface ParallelRunResult {
  /** All scenario reports */
  reports: ScenarioReport[];
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Number of passed scenarios */
  passed: number;
  /** Number of failed scenarios */
  failed: number;
  /** Whether all scenarios passed */
  success: boolean;
  /** Whether execution was bailed early */
  bailed: boolean;
  /** User isolation manager used */
  userIsolation: UserIsolationManager;
}

/**
 * Default concurrency limit.
 */
const DEFAULT_CONCURRENCY = 4;

/**
 * Default user ID when isolation is disabled.
 */
const DEFAULT_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * Convert a Scenario to ScenarioInfo for hooks.
 */
function toScenarioInfo(scenario: Scenario): ScenarioInfo {
  return {
    id: scenario.id,
    name: scenario.name ?? scenario.id,
    tags: scenario.tags,
  };
}

/**
 * Convert a ScenarioReport to ScenarioResultInfo for hooks.
 */
function toScenarioResultInfo(report: ScenarioReport): ScenarioResultInfo {
  return {
    passed: report.status === 'passed',
    error: report.error,
    duration: report.durationMs,
  };
}

/**
 * Execute scenarios in parallel with concurrency control.
 *
 * Each scenario gets a unique user ID (when isolation is enabled) to
 * prevent data conflicts. The concurrency limit prevents overwhelming
 * the infrastructure.
 *
 * @example
 * ```typescript
 * const result = await executeParallel(runner, scenarios, {
 *   concurrency: 4,
 *   isolateUsers: true,
 *   hooks: {
 *     beforeEach: async (scenario, { userId }) => {
 *       await db.delete(tasks).where(eq(tasks.userId, userId));
 *     },
 *   },
 * });
 * ```
 */
export async function executeParallel(
  runner: TestRunner,
  scenarios: Scenario[],
  options: ParallelRunOptions = {}
): Promise<ParallelRunResult> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    isolateUsers = true,
    defaultUserId = DEFAULT_USER_ID,
    bail = false,
    hooks,
    verbose,
    onScenarioStart,
    onScenarioComplete,
  } = options;

  // Create user isolation manager
  const userIsolation = createUserIsolationManager({
    defaultUserId,
    enabled: isolateUsers,
  });

  // Create concurrency limiter
  const limit = pLimit(concurrency);

  // Track results
  const reports: ScenarioReport[] = new Array(scenarios.length);
  let passed = 0;
  let failed = 0;
  let bailed = false;
  const startTime = Date.now();

  // Create tasks for all scenarios
  const tasks = scenarios.map((scenario, index) =>
    limit(async () => {
      // Check if we should bail
      if (bailed) {
        return null;
      }

      // Get user ID for this scenario
      const userId = userIsolation.getUserId(scenario.id);

      // Notify start
      onScenarioStart?.(scenario, index);

      try {
        // Run beforeEach hook with user context
        if (hooks?.beforeEach) {
          await hooks.beforeEach(toScenarioInfo(scenario), { userId });
        }

        // Mark user as "created" (hook may have created it)
        userIsolation.markCreated(scenario.id);

        // Run scenario with overridden user ID
        const report = await runner.runScenario(scenario, {
          verbose,
          userId, // Override the user ID
        });

        // Run afterEach hook with user context
        if (hooks?.afterEach) {
          await hooks.afterEach(
            toScenarioInfo(scenario),
            toScenarioResultInfo(report),
            { userId }
          );
        }

        // Update counts
        if (report.status === 'passed') {
          passed++;
        } else {
          failed++;
          if (bail) {
            bailed = true;
          }
        }

        // Store result
        reports[index] = report;

        // Notify completion
        onScenarioComplete?.(scenario, report, index);

        return report;
      } catch (error) {
        // Create error report
        const errorReport: ScenarioReport = {
          id: scenario.id,
          name: scenario.name,
          status: 'failed',
          steps: [],
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
          captured: {},
        };

        // Try to run afterEach even on error
        if (hooks?.afterEach) {
          try {
            await hooks.afterEach(
              toScenarioInfo(scenario),
              toScenarioResultInfo(errorReport),
              { userId }
            );
          } catch {
            // Ignore afterEach errors
          }
        }

        failed++;
        if (bail) {
          bailed = true;
        }

        reports[index] = errorReport;
        onScenarioComplete?.(scenario, errorReport, index);

        return errorReport;
      }
    })
  );

  // Wait for all tasks to complete
  await Promise.all(tasks);

  const totalDurationMs = Date.now() - startTime;

  return {
    reports: reports.filter((r): r is ScenarioReport => r !== null),
    totalDurationMs,
    passed,
    failed,
    success: failed === 0,
    bailed,
    userIsolation,
  };
}

/**
 * Convert parallel run result to a SuiteReport format.
 */
export function toSuiteReport(
  suiteName: string,
  result: ParallelRunResult
): SuiteReport {
  const now = new Date();
  return {
    name: suiteName,
    total: result.reports.length,
    passed: result.passed,
    failed: result.failed,
    skipped: 0,
    errors: 0,
    durationMs: result.totalDurationMs,
    scenarios: result.reports,
    startedAt: new Date(now.getTime() - result.totalDurationMs),
    endedAt: now,
  };
}

/**
 * Options for parallel suite execution.
 */
export interface ParallelSuiteOptions extends ParallelRunOptions {
  /** Filter scenarios by ID */
  id?: string;
  /** Filter scenarios by tag */
  tags?: string[];
  /** Filter scenarios by name pattern (grep) */
  grep?: string;
}

/**
 * Filter scenarios based on options.
 */
export function filterScenariosForParallel(
  scenarios: Scenario[],
  options: ParallelSuiteOptions
): Scenario[] {
  let filtered = [...scenarios];

  // Filter by ID
  if (options.id) {
    filtered = filtered.filter((s) => s.id === options.id);
  }

  // Filter by tags
  if (options.tags && options.tags.length > 0) {
    filtered = filtered.filter((s) =>
      s.tags?.some((tag) => options.tags!.includes(tag))
    );
  }

  // Filter by name pattern (grep)
  if (options.grep) {
    const pattern = new RegExp(options.grep, 'i');
    filtered = filtered.filter(
      (s) =>
        pattern.test(s.id) ||
        (s.name && pattern.test(s.name))
    );
  }

  return filtered;
}
