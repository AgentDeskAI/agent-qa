/**
 * Setup Step Executor
 *
 * Executes inline setup steps within scenarios.
 */

import type { AssertionResult } from '../../assertions/types.js';
import { pass, fail } from '../../assertions/types.js';
import type { InlineSetupStep } from '../../scenario/types.js';
import type { ExecutionContext } from '../context.js';
import type { SetupStepReport } from '../types.js';

/**
 * Options for executing a setup step.
 */
export interface ExecuteSetupStepOptions {
  /** Step to execute */
  step: InlineSetupStep;
  /** Execution context */
  context: ExecutionContext;
  /** Step index */
  index: number;
}

/**
 * Execute an inline setup step.
 */
export async function executeSetupStep(options: ExecuteSetupStepOptions): Promise<SetupStepReport> {
  const { step, context, index } = options;
  const startTime = Date.now();
  const assertions: AssertionResult[] = [];
  const aliasesCreated: string[] = [];

  try {
    if (context.verbose) {
      console.log(`  Setup: ${step.setup.length} entities`);
    }

    for (const item of step.setup) {
      // Resolve any aliases in data
      const resolvedData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item.data)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          // Handle $alias or $alias.field format
          resolvedData[key] = context.resolve(value);
        } else if (
          typeof value === 'object' &&
          value !== null &&
          'ref' in value &&
          typeof (value as { ref: unknown }).ref === 'string'
        ) {
          // Handle { ref: "$alias.field" } format from YAML
          const refString = (value as { ref: string }).ref;
          const normalizedRef = refString.startsWith('$') ? refString : `$${refString}`;
          resolvedData[key] = context.resolve(normalizedRef);
        } else {
          resolvedData[key] = value;
        }
      }

      // Coerce ISO date strings to Date objects for timestamp columns
      coerceDateStrings(resolvedData);

      // Auto-inject userId for user-scoped entities (if not already provided)
      const schema = context.database.getSchema(item.entity);
      if (schema?.userIdColumn && !resolvedData[schema.userIdColumn]) {
        resolvedData[schema.userIdColumn] = context.userId;
      }

      // Insert entity
      const result = await context.database.insert(item.entity, resolvedData);

      if (context.verbose) {
        console.log(`    Inserted ${item.entity}: ${result.id}${item.as ? ` as ${item.as}` : ''}`);
      }

      // Create alias if specified
      if (item.as) {
        context.setAlias(item.as, { id: result.id, type: item.entity });
        aliasesCreated.push(item.as);

        // Also capture for reference
        const entity = await context.database.findById(item.entity, result.id);
        if (entity.found && entity.entity) {
          context.capture(item.as, entity.entity);
        }
      }
    }

    assertions.push(pass(`Inserted ${step.setup.length} entities`));

    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'setup',
      status: 'passed',
      durationMs,
      assertions,
      entitiesInserted: step.setup.length,
      aliasesCreated,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    assertions.push(fail(error instanceof Error ? error.message : String(error)));

    return {
      index,
      label: step.label,
      type: 'setup',
      status: 'error',
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      assertions,
      entitiesInserted: 0,
      aliasesCreated,
    };
  }
}

/**
 * ISO 8601 date string regex pattern.
 * Matches formats like: 2025-12-31T14:00:00Z, 2025-12-31T14:00:00.000Z, 2025-12-31T14:00:00+00:00
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Coerce ISO date strings to Date objects in place.
 * This allows YAML setup blocks to use string dates that get converted to Date objects for Drizzle.
 */
function coerceDateStrings(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
      data[key] = new Date(value);
    }
  }
}
