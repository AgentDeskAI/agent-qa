/**
 * Wait Assertions
 *
 * Polling conditions and wait utilities.
 */

import type { WaitCondition, FieldMatcher, RefMatcher } from '../scenario/types.js';

import type { EntityQueryAdapter } from './entity.js';
import { matchFields, type MatcherContext } from './matchers.js';
import type { AssertionResult, EntityRow } from './types.js';
import { pass, fail } from './types.js';

/**
 * Options for wait operations.
 */
export interface WaitOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Poll interval in milliseconds */
  intervalMs?: number;
  /** Callback for each poll iteration */
  onPoll?: (attempt: number) => void;
}

/**
 * Default wait options.
 */
const DEFAULT_WAIT_OPTIONS: Required<Omit<WaitOptions, 'onPoll'>> = {
  timeoutMs: 30000, // 30 seconds
  intervalMs: 1000, // 1 second
};

/**
 * Wait for a condition to be true.
 */
export async function waitFor<T>(
  condition: () => Promise<{ success: boolean; value?: T; message?: string }>,
  options: WaitOptions = {}
): Promise<{ success: boolean; value?: T; message: string; attempts: number }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_OPTIONS.timeoutMs;
  const intervalMs = options.intervalMs ?? DEFAULT_WAIT_OPTIONS.intervalMs;

  const startTime = Date.now();
  let attempts = 0;

  while (true) {
    attempts++;
    options.onPoll?.(attempts);

    try {
      const result = await condition();

      if (result.success) {
        return {
          success: true,
          value: result.value,
          message: result.message ?? 'Condition met',
          attempts,
        };
      }

      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        return {
          success: false,
          message: result.message ?? `Timeout after ${attempts} attempts`,
          attempts,
        };
      }

      // Wait before next poll
      await sleep(intervalMs);
    } catch (error) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        return {
          success: false,
          message: `Error after ${attempts} attempts: ${error instanceof Error ? error.message : String(error)}`,
          attempts,
        };
      }

      // Wait before retry
      await sleep(intervalMs);
    }
  }
}

/**
 * Wait for an entity to match field conditions.
 */
export async function waitForEntity(
  adapter: EntityQueryAdapter,
  entityType: string,
  identifier: { id?: string; title?: string },
  fields: Record<string, FieldMatcher>,
  options: WaitOptions & { context?: MatcherContext } = {}
): Promise<AssertionResult & { entity?: EntityRow }> {
  const result = await waitFor(async () => {
    // Find entity
    let queryResult;
    if (identifier.id) {
      queryResult = await adapter.findById(entityType, identifier.id);
    } else if (identifier.title) {
      queryResult = await adapter.findByTitle(entityType, identifier.title);
    } else {
      return { success: false, message: 'No identifier provided' };
    }

    if (!queryResult.found || !queryResult.entity) {
      const idDesc = identifier.id ?? `title="${identifier.title}"`;
      return { success: false, message: `Entity not found: ${idDesc}` };
    }

    // Check fields
    const matchResult = matchFields(queryResult.entity, fields, options.context);

    if (matchResult.passed) {
      return { success: true, value: queryResult.entity };
    }

    return { success: false, message: matchResult.message };
  }, options);

  if (result.success) {
    return {
      ...pass(`Entity matched after ${result.attempts} poll(s)`),
      entity: result.value,
    };
  }

  return fail(`Wait failed: ${result.message}`);
}

/**
 * Wait for entity count to match.
 */
export async function waitForEntityCount(
  adapter: EntityQueryAdapter,
  entityType: string,
  expected: number | { min?: number; max?: number },
  filters?: Record<string, unknown>,
  options: WaitOptions = {}
): Promise<AssertionResult> {
  const result = await waitFor(async () => {
    const entities = await adapter.list(entityType, filters);
    const actual = entities.length;

    if (typeof expected === 'number') {
      if (actual === expected) {
        return { success: true, message: `Count is ${actual}` };
      }
      return { success: false, message: `Count is ${actual}, expected ${expected}` };
    }

    const { min, max } = expected;

    if (min !== undefined && actual < min) {
      return { success: false, message: `Count is ${actual}, expected >= ${min}` };
    }

    if (max !== undefined && actual > max) {
      return { success: false, message: `Count is ${actual}, expected <= ${max}` };
    }

    return { success: true, message: `Count is ${actual}` };
  }, options);

  if (result.success) {
    return pass(`Entity count matched after ${result.attempts} poll(s): ${result.message}`);
  }

  return fail(`Wait for count failed: ${result.message}`);
}

/**
 * Execute a wait step condition.
 *
 * WaitCondition has: entity, id (string | RefMatcher), fields (EntityFieldAssertion)
 */
export async function executeWaitCondition(
  condition: WaitCondition,
  adapter: EntityQueryAdapter,
  context: MatcherContext,
  options: WaitOptions = {}
): Promise<AssertionResult> {
  // Resolve id if it's a RefMatcher
  const resolvedId = resolveIdValue(condition.id, context);

  if (!resolvedId) {
    return fail(`Cannot resolve entity id: ${JSON.stringify(condition.id)}`);
  }

  // Wait for entity to match fields
  return waitForEntity(
    adapter,
    condition.entity,
    { id: resolvedId },
    condition.fields,
    { ...options, context }
  );
}

/**
 * Resolve an id value that may be a string, { ref: ... }, or RefMatcher.
 */
function resolveIdValue(
  value: string | RefMatcher | { ref: string },
  context: MatcherContext
): string | undefined {
  // If it's a simple string
  if (typeof value === 'string') {
    // Check if it's an alias reference ($alias or $alias.field)
    if (value.startsWith('$')) {
      return resolveAliasValue(value, context);
    }
    return value;
  }

  // If it's { ref: "$alias.field" } format (from YAML)
  if (typeof value === 'object' && 'ref' in value && typeof value.ref === 'string') {
    const refString = value.ref.startsWith('$') ? value.ref : `$${value.ref}`;
    return resolveAliasValue(refString, context);
  }

  // If it's a RefMatcher { from: alias, field: ... }
  if (typeof value === 'object' && 'from' in value) {
    const alias = value.from;
    const field = value.field ?? 'id';

    // Check captured entities - try BOTH with and without $ prefix
    // (entities may be stored as "$alias" or "alias" depending on capture source)
    const aliasWithDollar = alias.startsWith('$') ? alias : `$${alias}`;
    const aliasWithoutDollar = alias.startsWith('$') ? alias.slice(1) : alias;

    if (context.captured?.[aliasWithDollar]) {
      return String(context.captured[aliasWithDollar][field]);
    }
    if (context.captured?.[aliasWithoutDollar]) {
      return String(context.captured[aliasWithoutDollar][field]);
    }

    // Check aliases - try BOTH with and without $ prefix
    if (context.aliases?.has(aliasWithDollar)) {
      const entry = context.aliases.get(aliasWithDollar)!;
      if (field === 'id') {
        return entry.id;
      }
    }
    if (context.aliases?.has(aliasWithoutDollar)) {
      const entry = context.aliases.get(aliasWithoutDollar)!;
      if (field === 'id') {
        return entry.id;
      }
    }

    return undefined;
  }

  return undefined;
}

/**
 * Resolve an alias reference string ($alias or $alias.field).
 */
function resolveAliasValue(value: string, context: MatcherContext): string | undefined {
  if (!value.startsWith('$')) return value;

  const refPath = value.slice(1);
  const parts = refPath.split('.');
  const alias = parts[0];
  const field = parts[1] ?? 'id';

  // Check userId
  if (alias === 'userId' && context.userId) {
    return context.userId;
  }

  // Check captured - try BOTH with and without $ prefix
  const aliasWithDollar = alias.startsWith('$') ? alias : `$${alias}`;
  const aliasWithoutDollar = alias.startsWith('$') ? alias.slice(1) : alias;

  if (context.captured?.[aliasWithDollar]) {
    return String(context.captured[aliasWithDollar][field]);
  }
  if (context.captured?.[aliasWithoutDollar]) {
    return String(context.captured[aliasWithoutDollar][field]);
  }

  // Check aliases - try BOTH with and without $ prefix
  if (context.aliases?.has(aliasWithDollar)) {
    const entry = context.aliases.get(aliasWithDollar)!;
    if (field === 'id') {
      return entry.id;
    }
  }
  if (context.aliases?.has(aliasWithoutDollar)) {
    const entry = context.aliases.get(aliasWithoutDollar)!;
    if (field === 'id') {
      return entry.id;
    }
  }

  return undefined;
}

import { sleep } from '../helpers/utils.js';
