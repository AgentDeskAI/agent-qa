/**
 * Usage Assertions
 *
 * Validate token usage metrics from agent responses.
 * Useful for verifying caching behavior and monitoring token consumption.
 */

import type { UsageAssertion, UsageValue, ComparisonMatcher } from '../scenario/types.js';
import { isComparisonMatcher } from '../scenario/types.js';

import type { AssertionResult } from './types.js';
import { pass, fail, combineResults } from './types.js';

/**
 * Token usage totals from agent response.
 *
 * Matches the structure from detailedUsage.totals in chat responses.
 */
export interface UsageTotals {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  callCount?: number;
  cachedInputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  reasoningTokens?: number;
}

/**
 * Assert token usage metrics match expectations.
 *
 * Supports exact value matching or comparison matchers (gt, gte, lt, lte).
 *
 * @example
 * ```typescript
 * assertUsage(response.detailedUsage?.totals, {
 *   cacheReadTokens: { gt: 0 },  // Must have cache hits
 *   totalTokens: { lt: 30000 },   // Reasonable limit
 * });
 * ```
 */
export function assertUsage(
  usage: UsageTotals | undefined,
  assertion: UsageAssertion
): AssertionResult {
  if (!usage) {
    return fail('No usage data available', {
      expected: assertion,
      actual: undefined,
    });
  }

  const results: AssertionResult[] = [];

  // Check each asserted field
  if (assertion.cacheReadTokens !== undefined) {
    results.push(
      assertUsageField('cacheReadTokens', usage.cacheReadTokens, assertion.cacheReadTokens)
    );
  }

  if (assertion.cacheCreationTokens !== undefined) {
    results.push(
      assertUsageField('cacheCreationTokens', usage.cacheCreationTokens, assertion.cacheCreationTokens)
    );
  }

  if (assertion.inputTokens !== undefined) {
    results.push(
      assertUsageField('inputTokens', usage.inputTokens, assertion.inputTokens)
    );
  }

  if (assertion.outputTokens !== undefined) {
    results.push(
      assertUsageField('outputTokens', usage.outputTokens, assertion.outputTokens)
    );
  }

  if (assertion.totalTokens !== undefined) {
    results.push(
      assertUsageField('totalTokens', usage.totalTokens, assertion.totalTokens)
    );
  }

  if (assertion.callCount !== undefined) {
    results.push(
      assertUsageField('callCount', usage.callCount, assertion.callCount)
    );
  }

  // Handle anyOf (OR logic)
  if (assertion.anyOf && assertion.anyOf.length > 0) {
    results.push(assertAnyOf(usage, assertion.anyOf));
  }

  // Handle allOf (explicit AND logic)
  if (assertion.allOf && assertion.allOf.length > 0) {
    results.push(assertAllOf(usage, assertion.allOf));
  }

  if (results.length === 0) {
    return pass('No usage assertions to check');
  }

  return combineResults(results);
}

/**
 * Assert at least one sub-assertion passes (OR logic).
 */
function assertAnyOf(
  usage: UsageTotals,
  assertions: UsageAssertion[]
): AssertionResult {
  const subResults = assertions.map(sub => assertUsage(usage, sub));
  const passed = subResults.filter(r => r.passed);

  if (passed.length > 0) {
    return pass(`anyOf: ${passed.length} of ${assertions.length} conditions passed`);
  }

  // Build failure message with details
  const failMessages = subResults.map(r => r.message).join('; ');
  return fail(`anyOf failed: none of ${assertions.length} conditions passed: ${failMessages}`, {
    expected: 'at least one condition to pass',
    actual: 'all conditions failed',
  });
}

/**
 * Assert all sub-assertions pass (explicit AND logic).
 */
function assertAllOf(
  usage: UsageTotals,
  assertions: UsageAssertion[]
): AssertionResult {
  const subResults = assertions.map(sub => assertUsage(usage, sub));
  const failed = subResults.filter(r => !r.passed);

  if (failed.length === 0) {
    return pass(`allOf: all ${assertions.length} conditions passed`);
  }

  const failMessages = failed.map(r => r.message).join('; ');
  return fail(`allOf failed: ${failed.length} of ${assertions.length} conditions failed: ${failMessages}`, {
    expected: 'all conditions to pass',
    actual: `${failed.length} failed`,
  });
}

/**
 * Assert a single usage field value.
 */
function assertUsageField(
  fieldName: string,
  actual: number | undefined,
  expected: UsageValue
): AssertionResult {
  // Handle missing actual value
  if (actual === undefined) {
    return fail(`${fieldName}: value is undefined`, {
      expected,
      actual: undefined,
    });
  }

  // Exact value match
  if (typeof expected === 'number') {
    if (actual === expected) {
      return pass(`${fieldName}: ${actual}`);
    }
    return fail(`${fieldName}: expected ${expected}, got ${actual}`, {
      expected,
      actual,
    });
  }

  // Comparison matcher
  if (isComparisonMatcher(expected)) {
    return assertComparison(fieldName, actual, expected);
  }

  return fail(`${fieldName}: invalid assertion type`, {
    expected,
    actual,
  });
}

/**
 * Assert a numeric comparison.
 */
function assertComparison(
  fieldName: string,
  actual: number,
  matcher: ComparisonMatcher
): AssertionResult {
  // Check gt
  if (matcher.gt !== undefined && !(actual > matcher.gt)) {
    return fail(`${fieldName}: expected > ${matcher.gt}, got ${actual}`, {
      expected: `> ${matcher.gt}`,
      actual,
    });
  }

  // Check gte
  if (matcher.gte !== undefined && !(actual >= matcher.gte)) {
    return fail(`${fieldName}: expected >= ${matcher.gte}, got ${actual}`, {
      expected: `>= ${matcher.gte}`,
      actual,
    });
  }

  // Check lt
  if (matcher.lt !== undefined && !(actual < matcher.lt)) {
    return fail(`${fieldName}: expected < ${matcher.lt}, got ${actual}`, {
      expected: `< ${matcher.lt}`,
      actual,
    });
  }

  // Check lte
  if (matcher.lte !== undefined && !(actual <= matcher.lte)) {
    return fail(`${fieldName}: expected <= ${matcher.lte}, got ${actual}`, {
      expected: `<= ${matcher.lte}`,
      actual,
    });
  }

  // Build description of what was checked
  const checks: string[] = [];
  if (matcher.gt !== undefined) checks.push(`> ${matcher.gt}`);
  if (matcher.gte !== undefined) checks.push(`>= ${matcher.gte}`);
  if (matcher.lt !== undefined) checks.push(`< ${matcher.lt}`);
  if (matcher.lte !== undefined) checks.push(`<= ${matcher.lte}`);

  return pass(`${fieldName}: ${actual} (${checks.join(', ')})`);
}
