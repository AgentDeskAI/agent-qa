/**
 * Wait Step Executor
 *
 * Executes wait steps for polling and delays.
 */

import { executeWaitCondition } from '../../assertions/index.js';
import type { AssertionResult } from '../../assertions/types.js';
import {
  DEFAULT_WAIT_TIMEOUT_SECONDS,
  DEFAULT_WAIT_INTERVAL_SECONDS,
} from '../../constants.js';
import type { WaitStep, WaitCondition } from '../../scenario/types.js';
import type { ExecutionContext } from '../context.js';
import type { WaitStepReport } from '../types.js';

/**
 * Options for executing a wait step.
 */
export interface ExecuteWaitStepOptions {
  /** Step to execute */
  step: WaitStep;
  /** Execution context */
  context: ExecutionContext;
  /** Step index */
  index: number;
}

/**
 * Execute a wait step.
 */
export async function executeWaitStep(options: ExecuteWaitStepOptions): Promise<WaitStepReport> {
  const { step, context, index } = options;
  const startTime = Date.now();
  const assertions: AssertionResult[] = [];

  try {
    // Check if it's a simple delay
    if ('seconds' in step.wait) {
      const seconds = step.wait.seconds;

      if (context.verbose) {
        console.log(`  Wait: ${seconds}s`);
      }

      await sleep(seconds * 1000);

      const durationMs = Date.now() - startTime;

      return {
        index,
        label: step.label,
        type: 'wait',
        status: 'passed',
        durationMs,
        assertions,
        waitedSeconds: seconds,
      };
    }

    // It's a condition wait
    const condition = step.wait as WaitCondition;
    const timeoutSeconds = step.timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS;
    const intervalSeconds = step.intervalSeconds ?? DEFAULT_WAIT_INTERVAL_SECONDS;

    if (context.verbose) {
      console.log(`  Wait for: ${condition.entity} (timeout: ${timeoutSeconds}s)`);
    }

    let pollAttempts = 0;
    const result = await executeWaitCondition(
      condition,
      context.database,
      context.getMatcherContext(),
      {
        timeoutMs: timeoutSeconds * 1000,
        intervalMs: intervalSeconds * 1000,
        onPoll: () => {
          pollAttempts++;
        },
      }
    );

    assertions.push(result);

    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'wait',
      status: result.passed ? 'passed' : 'failed',
      durationMs,
      error: result.passed ? undefined : result.message,
      assertions,
      pollAttempts,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'wait',
      status: 'error',
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      assertions,
    };
  }
}

import { sleep } from '../../helpers/utils.js';
