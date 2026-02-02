/**
 * Assertion Types
 *
 * Core types for assertion results and validation.
 */

/**
 * Result of an assertion check.
 */
export interface AssertionResult {
  /** Whether the assertion passed */
  passed: boolean;
  /** Human-readable message */
  message: string;
  /** Expected value (for display) */
  expected?: unknown;
  /** Actual value (for display) */
  actual?: unknown;
  /** Path to the failed field (for nested assertions) */
  path?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Create a passing assertion result.
 */
export function pass(message: string): AssertionResult {
  return { passed: true, message };
}

/**
 * Create a failing assertion result.
 */
export function fail(
  message: string,
  options?: {
    expected?: unknown;
    actual?: unknown;
    path?: string;
    context?: Record<string, unknown>;
  }
): AssertionResult {
  return {
    passed: false,
    message,
    ...options,
  };
}

/**
 * Combine multiple assertion results.
 */
export function combineResults(results: AssertionResult[]): AssertionResult {
  const failures = results.filter((r) => !r.passed);

  if (failures.length === 0) {
    return pass(`All ${results.length} assertions passed`);
  }

  const messages = failures.map((f) => f.message).join('; ');
  return fail(`${failures.length} of ${results.length} assertions failed: ${messages}`, {
    context: { failures },
  });
}

/**
 * Tool call representation from agent response.
 */
export interface ToolCall {
  /** Tool name */
  name: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Tool result (if available) */
  result?: unknown;
}

/**
 * Entity row from database.
 */
export interface EntityRow {
  /** Entity ID */
  id: string;
  /** All entity fields */
  [key: string]: unknown;
}

/**
 * Query result from database adapter.
 */
export interface QueryResult {
  /** Found entity or null */
  entity: EntityRow | null;
  /** Whether entity was found */
  found: boolean;
}
