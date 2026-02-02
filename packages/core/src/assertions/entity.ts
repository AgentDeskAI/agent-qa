/**
 * Entity Assertions
 *
 * Validate entity state in database.
 */

import type { CreatedAssertion, FieldMatcher, EntityVerification } from '../scenario/types.js';
import { resolveAliasRef, type AliasContext } from '../utils/alias.js';

import { matchFields, type MatcherContext } from './matchers.js';
import type { AssertionResult, EntityRow, QueryResult } from './types.js';
import { pass, fail, combineResults } from './types.js';

/**
 * Database adapter interface for entity assertions.
 */
export interface EntityQueryAdapter {
  /** Find entity by ID */
  findById(entity: string, id: string): Promise<QueryResult>;
  /** Find entity by title/name field */
  findByTitle(entity: string, title: string): Promise<QueryResult>;
  /** List entities with filters */
  list(entity: string, filters?: Record<string, unknown>): Promise<EntityRow[]>;
}

/**
 * Options for entity verification.
 */
export interface VerifyEntityOptions {
  /** Matcher context for refs */
  context?: MatcherContext;
}

/**
 * Verify an entity exists and matches field assertions.
 */
export async function verifyEntity(
  adapter: EntityQueryAdapter,
  entityType: string,
  identifier: { id?: string; title?: string },
  fields: Record<string, FieldMatcher>,
  options: VerifyEntityOptions = {}
): Promise<AssertionResult> {
  // Find the entity
  let result: QueryResult;

  if (identifier.id) {
    result = await adapter.findById(entityType, identifier.id);
  } else if (identifier.title) {
    result = await adapter.findByTitle(entityType, identifier.title);
  } else {
    return fail(`No identifier provided for ${entityType} verification`);
  }

  if (!result.found || !result.entity) {
    const idDesc = identifier.id ?? `title="${identifier.title}"`;
    return fail(`${entityType} not found: ${idDesc}`, {
      expected: 'entity exists',
      actual: null,
    });
  }

  // Match fields
  return matchFields(result.entity, fields, options.context);
}

/**
 * Assert created entities from a chat step.
 *
 * Accepts an array of CreatedAssertion objects.
 */
export async function assertCreatedEntities(
  adapter: EntityQueryAdapter,
  assertions: CreatedAssertion[],
  context: MatcherContext = {}
): Promise<{ result: AssertionResult; captured: Record<string, EntityRow> }> {
  const results: AssertionResult[] = [];
  const captured: Record<string, EntityRow> = {};

  for (const assertion of assertions) {
    const entityResult = await assertSingleCreatedEntity(
      adapter,
      assertion.entity,
      assertion,
      context
    );

    results.push(entityResult.result);

    // Capture entity if has alias
    if (entityResult.entity && assertion.as) {
      captured[assertion.as] = entityResult.entity;
    }
  }

  return {
    result: combineResults(results),
    captured,
  };
}

/**
 * Assert a single created entity.
 */
async function assertSingleCreatedEntity(
  adapter: EntityQueryAdapter,
  entityType: string,
  assertion: CreatedAssertion,
  context: MatcherContext
): Promise<{ result: AssertionResult; entity?: EntityRow }> {
  // Build filters and field checks from assertion.fields
  const filters: Record<string, unknown> = {};
  const fieldChecks: Record<string, FieldMatcher> = {};

  if (assertion.fields) {
    for (const [key, value] of Object.entries(assertion.fields)) {
      // Simple string values can be used as filters
      if (typeof value === 'string' && !value.startsWith('$')) {
        filters[key] = value;
      }

      // All fields should be checked
      fieldChecks[key] = value as FieldMatcher;
    }
  }

  // Try to find entity
  const entities = await adapter.list(entityType, filters);

  if (entities.length === 0) {
    return {
      result: fail(`No ${entityType} found matching filters: ${JSON.stringify(filters)}`, {
        expected: 'at least one matching entity',
        actual: 0,
      }),
    };
  }

  // Check each entity against field assertions
  for (const entity of entities) {
    const matchResult = matchFields(entity, fieldChecks, context);

    if (matchResult.passed) {
      return {
        result: pass(`Found ${entityType} matching all field assertions`),
        entity,
      };
    }
  }

  // No entity matched all fields
  return {
    result: fail(`Found ${entities.length} ${entityType}(s) but none matched all field assertions`, {
      expected: fieldChecks,
      actual: entities.slice(0, 3), // Show first 3 for debugging
    }),
  };
}

/**
 * Verify multiple entities in a verify step.
 */
export async function verifyEntities(
  adapter: EntityQueryAdapter,
  verifications: Record<string, EntityVerification[]>,
  context: MatcherContext = {}
): Promise<AssertionResult> {
  const results: AssertionResult[] = [];

  for (const [entityType, entityChecks] of Object.entries(verifications)) {
    for (const check of entityChecks) {
      // Look for id or title identifier
      const identifier: { id?: string; title?: string } = {};

      // Handle id which can be string, { ref: ... }, or { from: ..., field: ... }
      if (check.id) {
        if (typeof check.id === 'string') {
          // Resolve alias if needed
          if (check.id.startsWith('$')) {
            const resolved = resolveRef(check.id, context);
            if (resolved) {
              identifier.id = resolved;
            } else {
              results.push(fail(`Cannot resolve reference: ${check.id}`));
              continue;
            }
          } else {
            identifier.id = check.id;
          }
        } else if ('ref' in check.id && typeof check.id.ref === 'string') {
          // Handle { ref: "$alias.field" } format
          const refString = check.id.ref.startsWith('$') ? check.id.ref : `$${check.id.ref}`;
          const resolved = resolveRef(refString, context);
          if (resolved) {
            identifier.id = resolved;
          } else {
            results.push(fail(`Cannot resolve reference: ${check.id.ref}`));
            continue;
          }
        } else if ('from' in check.id) {
          // Handle { from: alias, field: ... } format (RefMatcher)
          const resolved = resolveRef(`$${check.id.from}${check.id.field ? '.' + check.id.field : ''}`, context);
          if (resolved) {
            identifier.id = resolved;
          } else {
            results.push(fail(`Cannot resolve reference: ${JSON.stringify(check.id)}`));
            continue;
          }
        } else {
          results.push(fail(`Invalid id format: ${JSON.stringify(check.id)}`));
          continue;
        }
      }

      // Handle title
      if (check.title && typeof check.title === 'string') {
        identifier.title = check.title;
      }

      if (!identifier.id && !identifier.title) {
        results.push(fail(`No identifier (id or title) provided for ${entityType} verification`));
        continue;
      }

      // Handle notExists assertion - verify entity does NOT exist
      if (check.notExists) {
        let result: QueryResult;
        if (identifier.id) {
          result = await adapter.findById(entityType, identifier.id);
        } else {
          result = await adapter.findByTitle(entityType, identifier.title!);
        }

        if (result.found && result.entity) {
          results.push(fail(`${entityType} should not exist but was found: ${identifier.id ?? identifier.title}`));
        } else {
          results.push(pass(`${entityType} correctly does not exist`));
        }
        continue; // Skip normal field assertions
      }

      // Get field matchers from the fields property
      const fieldMatchers: Record<string, FieldMatcher> = check.fields ?? {};

      const result = await verifyEntity(
        adapter,
        entityType,
        identifier,
        fieldMatchers,
        { context }
      );
      results.push(result);
    }
  }

  return combineResults(results);
}

/**
 * Resolve a reference value.
 * Uses centralized alias resolution from utils/alias.ts.
 */
function resolveRef(value: string, context: MatcherContext): string | undefined {
  // Non-references pass through unchanged
  if (!value.startsWith('$')) return value;

  // Build context for resolver
  const aliasContext: AliasContext = {
    captured: context.captured,
    aliases: context.aliases,
    userId: context.userId,
  };

  // Use centralized resolution
  const result = resolveAliasRef(value, aliasContext);

  if (result.found) {
    return String(result.value);
  }

  return undefined;
}

/**
 * Assert entity count.
 */
export async function assertEntityCount(
  adapter: EntityQueryAdapter,
  entityType: string,
  expected: number | { min?: number; max?: number },
  filters?: Record<string, unknown>
): Promise<AssertionResult> {
  const entities = await adapter.list(entityType, filters);
  const actual = entities.length;

  if (typeof expected === 'number') {
    if (actual === expected) {
      return pass(`${entityType} count: ${actual}`);
    }
    return fail(`Expected ${expected} ${entityType}(s), got ${actual}`, {
      expected,
      actual,
    });
  }

  const { min, max } = expected;

  if (min !== undefined && actual < min) {
    return fail(`Expected at least ${min} ${entityType}(s), got ${actual}`, {
      expected: `>= ${min}`,
      actual,
    });
  }

  if (max !== undefined && actual > max) {
    return fail(`Expected at most ${max} ${entityType}(s), got ${actual}`, {
      expected: `<= ${max}`,
      actual,
    });
  }

  return pass(`${entityType} count: ${actual} (within range)`);
}
