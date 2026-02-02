/**
 * Alias Resolution Utilities
 *
 * Centralized alias handling to ensure consistent storage and lookup.
 *
 * Convention: Aliases are stored WITHOUT the $ prefix internally.
 * The $ prefix is only used in YAML files for user convenience.
 */

import type { AliasEntry } from '../scenario/setup.js';

/**
 * Normalize an alias by stripping the $ prefix if present.
 *
 * @example
 * normalizeAlias('$myTask') // 'myTask'
 * normalizeAlias('myTask')  // 'myTask'
 */
export function normalizeAlias(alias: string): string {
  return alias.startsWith('$') ? alias.slice(1) : alias;
}

/**
 * Context for resolving alias references.
 */
export interface AliasContext {
  /** Captured entities by alias (normalized keys) */
  captured?: Record<string, { id: string; [key: string]: unknown }>;
  /** Aliases from setup (normalized keys) */
  aliases?: Map<string, AliasEntry>;
  /** Current user ID */
  userId?: string;
}

/**
 * Result of alias resolution.
 */
export type AliasResolutionResult =
  | { found: true; value: unknown; source: 'captured' | 'alias' | 'userId' }
  | { found: false };

/**
 * Resolve an alias reference to its value.
 *
 * Handles:
 * - $userId -> context.userId
 * - $alias.field -> captured entity or alias entry
 *
 * @example
 * resolveAliasRef('$myTask.id', context)     // { found: true, value: 'task-123', source: 'captured' }
 * resolveAliasRef('$userId', context)        // { found: true, value: 'user-456', source: 'userId' }
 * resolveAliasRef('$unknown', context)       // { found: false }
 */
export function resolveAliasRef(
  ref: string,
  context: AliasContext
): AliasResolutionResult {
  // Must start with $ to be a reference
  if (!ref.startsWith('$')) {
    return { found: false };
  }

  // Parse the reference: $alias.field
  const refPath = ref.slice(1); // Remove $
  const parts = refPath.split('.');
  const alias = normalizeAlias(parts[0]); // Normalize again in case it had double $
  const field = parts[1] ?? 'id';

  // Special case: $userId
  if (alias === 'userId' && context.userId) {
    return { found: true, value: context.userId, source: 'userId' };
  }

  // Check captured entities
  if (context.captured?.[alias]) {
    const entity = context.captured[alias];
    const value = entity[field];
    if (value !== undefined) {
      return { found: true, value, source: 'captured' };
    }
  }

  // Check aliases from setup
  if (context.aliases?.has(alias)) {
    const entry = context.aliases.get(alias)!;
    if (field === 'id') {
      return { found: true, value: entry.id, source: 'alias' };
    }
    // Only .id is accessible from aliases
  }

  return { found: false };
}

/**
 * Resolve a value that may be an alias reference, returning the resolved string.
 *
 * If the value is not a reference or cannot be resolved, returns the original value.
 *
 * @example
 * resolveValue('$myTask.id', context)  // 'task-123' (resolved)
 * resolveValue('literal', context)     // 'literal' (unchanged)
 * resolveValue('$unknown', context)    // '$unknown' (unchanged, not found)
 */
export function resolveValue(value: string, context: AliasContext): string {
  const result = resolveAliasRef(value, context);
  if (result.found) {
    return String(result.value);
  }
  return value;
}
