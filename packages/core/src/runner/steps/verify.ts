/**
 * Verify Step Executor
 *
 * Executes verify steps to check database state.
 */

import { verifyEntities } from '../../assertions/index.js';
import type { AssertionResult } from '../../assertions/types.js';
import type { VerifyStep } from '../../scenario/types.js';
import type { ExecutionContext } from '../context.js';
import type { VerifyStepReport } from '../types.js';

/**
 * Options for executing a verify step.
 */
export interface ExecuteVerifyStepOptions {
  /** Step to execute */
  step: VerifyStep;
  /** Execution context */
  context: ExecutionContext;
  /** Step index */
  index: number;
}

/**
 * Execute a verify step.
 */
export async function executeVerifyStep(options: ExecuteVerifyStepOptions): Promise<VerifyStepReport> {
  const { step, context, index } = options;
  const startTime = Date.now();
  const assertions: AssertionResult[] = [];

  try {
    if (context.verbose) {
      const entityTypes = Object.keys(step.verify);
      console.log(`  Verify: ${entityTypes.join(', ')}`);
    }

    // Count entities to verify
    let entitiesVerified = 0;
    for (const verifications of Object.values(step.verify)) {
      entitiesVerified += verifications.length;
    }

    // Run verifications
    const result = await verifyEntities(
      context.database,
      step.verify,
      context.getMatcherContext()
    );

    assertions.push(result);

    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'verify',
      status: result.passed ? 'passed' : 'failed',
      durationMs,
      error: result.passed ? undefined : result.message,
      assertions,
      entitiesVerified,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'verify',
      status: 'error',
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      assertions,
      entitiesVerified: 0,
    };
  }
}
