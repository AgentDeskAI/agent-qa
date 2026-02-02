/**
 * Field Matchers
 *
 * Core field matching logic for assertions.
 */

import type {
  FieldMatcher,
  ContainsMatcher,
  ContainsAnyMatcher,
  ExistsMatcher,
  ComparisonMatcher,
  RegexMatcher,
  RefMatcher,
} from '../scenario/types.js';
import {
  isContainsMatcher,
  isContainsAnyMatcher,
  isExistsMatcher,
  isComparisonMatcher,
  isRegexMatcher,
  isRefMatcher,
} from '../scenario/types.js';
import { normalizeAlias, resolveAliasRef, type AliasContext } from '../utils/alias.js';

import type { AssertionResult } from './types.js';
import { pass, fail } from './types.js';

/**
 * Context for resolving references in matchers.
 */
export interface MatcherContext {
  /** Captured entities by alias */
  captured?: Record<string, { id: string; [key: string]: unknown }>;
  /** Aliases from setup */
  aliases?: Map<string, { id: string; type: string }>;
  /** Current user ID */
  userId?: string;
}

/**
 * Match a field value against a matcher.
 */
export function matchField(
  actual: unknown,
  matcher: FieldMatcher,
  context: MatcherContext = {}
): AssertionResult {
  // Handle null/undefined actual
  if (actual === null || actual === undefined) {
    // exists: false should pass for null/undefined
    if (isExistsMatcher(matcher) && !matcher.exists) {
      return pass('Field does not exist as expected');
    }

    // Any other matcher fails on null/undefined
    return fail('Field is null or undefined', { expected: matcher, actual });
  }

  // Literal value comparison
  if (isLiteralMatcher(matcher)) {
    return matchLiteral(actual, matcher);
  }

  // Contains matcher
  if (isContainsMatcher(matcher)) {
    return matchContains(actual, matcher);
  }

  // Contains-any matcher
  if (isContainsAnyMatcher(matcher)) {
    return matchContainsAny(actual, matcher);
  }

  // Exists matcher
  if (isExistsMatcher(matcher)) {
    return matchExists(actual, matcher);
  }

  // Comparison matcher
  if (isComparisonMatcher(matcher)) {
    return matchComparison(actual, matcher);
  }

  // Regex matcher
  if (isRegexMatcher(matcher)) {
    return matchRegex(actual, matcher);
  }

  // Ref matcher (RefMatcher format: { from: alias, field: ... })
  if (isRefMatcher(matcher)) {
    return matchRef(actual, matcher, context);
  }

  // Ref matcher (YAML format: { ref: "$alias.field" })
  if (
    typeof matcher === 'object' &&
    matcher !== null &&
    'ref' in matcher &&
    typeof (matcher as { ref: unknown }).ref === 'string'
  ) {
    return matchYamlRef(actual, (matcher as { ref: string }).ref, context);
  }

  // Unknown matcher type - treat as literal
  return matchLiteral(actual, matcher);
}

/**
 * Check if a matcher is a literal value.
 */
function isLiteralMatcher(
  matcher: FieldMatcher
): matcher is string | number | boolean | null {
  return (
    matcher === null ||
    typeof matcher === 'string' ||
    typeof matcher === 'number' ||
    typeof matcher === 'boolean'
  );
}

/**
 * Match a literal value.
 */
function matchLiteral(actual: unknown, expected: string | number | boolean | null): AssertionResult {
  if (actual === expected) {
    return pass(`Value equals ${JSON.stringify(expected)}`);
  }

  // Try type coercion for numbers
  if (typeof expected === 'number' && typeof actual === 'string') {
    if (parseFloat(actual) === expected) {
      return pass(`Value equals ${expected} (after numeric conversion)`);
    }
  }

  // Try type coercion for booleans
  if (typeof expected === 'boolean' && typeof actual === 'string') {
    const actualBool = actual.toLowerCase() === 'true';
    if (actualBool === expected) {
      return pass(`Value equals ${expected} (after boolean conversion)`);
    }
  }

  return fail(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, {
    expected,
    actual,
  });
}

/**
 * Match using contains matcher.
 */
function matchContains(actual: unknown, matcher: ContainsMatcher): AssertionResult {
  const targets = Array.isArray(matcher.contains) ? matcher.contains : [matcher.contains];

  // String contains
  if (typeof actual === 'string') {
    const missing = targets.filter((t) => !actual.includes(t));
    if (missing.length === 0) {
      return pass(`String contains all targets`);
    }
    return fail(`String does not contain: ${missing.join(', ')}`, {
      expected: `contains ${JSON.stringify(targets)}`,
      actual,
    });
  }

  // Array contains
  if (Array.isArray(actual)) {
    const missing = targets.filter((t) => !actual.includes(t));
    if (missing.length === 0) {
      return pass(`Array contains all targets`);
    }
    return fail(`Array does not contain: ${missing.join(', ')}`, {
      expected: `contains ${JSON.stringify(targets)}`,
      actual,
    });
  }

  return fail(`Cannot check contains on ${typeof actual}`, {
    expected: matcher,
    actual,
  });
}

/**
 * Match using contains-any matcher (OR logic - at least one must match).
 */
function matchContainsAny(actual: unknown, matcher: ContainsAnyMatcher): AssertionResult {
  const targets = matcher.containsAny;

  // String contains-any (case-insensitive)
  if (typeof actual === 'string') {
    const actualLower = actual.toLowerCase();
    const matched = targets.filter((t) => actualLower.includes(t.toLowerCase()));
    if (matched.length > 0) {
      return pass(`String contains at least one of targets: ${matched.join(', ')}`);
    }
    return fail(`String does not contain any of: ${targets.join(', ')}`, {
      expected: `containsAny ${JSON.stringify(targets)}`,
      actual,
    });
  }

  // Array contains-any
  if (Array.isArray(actual)) {
    const matched = targets.filter((t) => actual.includes(t));
    if (matched.length > 0) {
      return pass(`Array contains at least one of targets: ${matched.join(', ')}`);
    }
    return fail(`Array does not contain any of: ${targets.join(', ')}`, {
      expected: `containsAny ${JSON.stringify(targets)}`,
      actual,
    });
  }

  return fail(`Cannot check containsAny on ${typeof actual}`, {
    expected: matcher,
    actual,
  });
}

/**
 * Match using exists matcher.
 */
function matchExists(actual: unknown, matcher: ExistsMatcher): AssertionResult {
  const exists = actual !== null && actual !== undefined;

  if (matcher.exists && exists) {
    return pass('Field exists');
  }

  if (!matcher.exists && !exists) {
    return pass('Field does not exist');
  }

  if (matcher.exists) {
    return fail('Expected field to exist, but it does not', {
      expected: 'exists',
      actual: null,
    });
  }

  return fail('Expected field to not exist, but it does', {
    expected: 'not exists',
    actual,
  });
}

/**
 * Match using comparison matcher.
 */
function matchComparison(actual: unknown, matcher: ComparisonMatcher): AssertionResult {
  // Convert actual to number if possible
  const actualNum =
    typeof actual === 'number'
      ? actual
      : typeof actual === 'string'
        ? parseFloat(actual)
        : NaN;

  if (isNaN(actualNum)) {
    return fail(`Cannot compare non-numeric value: ${JSON.stringify(actual)}`, {
      expected: matcher,
      actual,
    });
  }

  // Check gt
  if (matcher.gt !== undefined && !(actualNum > matcher.gt)) {
    return fail(`Expected > ${matcher.gt}, got ${actualNum}`, {
      expected: `> ${matcher.gt}`,
      actual: actualNum,
    });
  }

  // Check gte
  if (matcher.gte !== undefined && !(actualNum >= matcher.gte)) {
    return fail(`Expected >= ${matcher.gte}, got ${actualNum}`, {
      expected: `>= ${matcher.gte}`,
      actual: actualNum,
    });
  }

  // Check lt
  if (matcher.lt !== undefined && !(actualNum < matcher.lt)) {
    return fail(`Expected < ${matcher.lt}, got ${actualNum}`, {
      expected: `< ${matcher.lt}`,
      actual: actualNum,
    });
  }

  // Check lte
  if (matcher.lte !== undefined && !(actualNum <= matcher.lte)) {
    return fail(`Expected <= ${matcher.lte}, got ${actualNum}`, {
      expected: `<= ${matcher.lte}`,
      actual: actualNum,
    });
  }

  return pass(`Value ${actualNum} satisfies comparison`);
}

/**
 * Match using regex matcher.
 */
function matchRegex(actual: unknown, matcher: RegexMatcher): AssertionResult {
  if (typeof actual !== 'string') {
    return fail(`Cannot match regex on non-string value: ${typeof actual}`, {
      expected: matcher,
      actual,
    });
  }

  const regex = new RegExp(matcher.matches, matcher.flags);

  if (regex.test(actual)) {
    return pass(`Value matches /${matcher.matches}/${matcher.flags ?? ''}`);
  }

  return fail(`Value does not match /${matcher.matches}/${matcher.flags ?? ''}`, {
    expected: `matches /${matcher.matches}/${matcher.flags ?? ''}`,
    actual,
  });
}

/**
 * Match using ref matcher.
 */
function matchRef(
  actual: unknown,
  matcher: RefMatcher,
  context: MatcherContext
): AssertionResult {
  // RefMatcher has `from` (step label) and optional `field`
  const alias = matcher.from;
  const field = matcher.field ?? 'id';

  const refDesc = `${alias}.${field}`;

  // Try captured entities first
  if (context.captured?.[alias]) {
    const expected = context.captured[alias][field];
    if (actual === expected) {
      return pass(`Value matches ref ${refDesc}`);
    }
    return fail(`Expected ${JSON.stringify(expected)} from ref ${refDesc}, got ${JSON.stringify(actual)}`, {
      expected,
      actual,
    });
  }

  // Try aliases
  if (context.aliases?.has(alias)) {
    const aliasEntry = context.aliases.get(alias)!;
    if (field === 'id') {
      if (actual === aliasEntry.id) {
        return pass(`Value matches ref ${refDesc}`);
      }
      return fail(`Expected ${JSON.stringify(aliasEntry.id)} from ref ${refDesc}, got ${JSON.stringify(actual)}`, {
        expected: aliasEntry.id,
        actual,
      });
    }
    // Can't access other fields from alias entry
    return fail(`Cannot access field "${field}" from alias "${alias}" (only .id available)`, {
      expected: refDesc,
      actual,
    });
  }

  // Handle special $userId reference
  if (alias === 'userId' && context.userId) {
    if (actual === context.userId) {
      return pass('Value matches $userId');
    }
    return fail(`Expected userId ${context.userId}, got ${JSON.stringify(actual)}`, {
      expected: context.userId,
      actual,
    });
  }

  return fail(`Unknown reference: ${refDesc}`, {
    expected: refDesc,
    actual,
  });
}

/**
 * Match using YAML ref format ({ ref: "$alias.field" }).
 * Uses centralized alias resolution from utils/alias.ts.
 */
function matchYamlRef(
  actual: unknown,
  refString: string,
  context: MatcherContext
): AssertionResult {
  // Ensure refString starts with $ for the resolver
  const normalizedRefString = refString.startsWith('$') ? refString : `$${refString}`;

  // Parse for error messages
  const parts = normalizedRefString.slice(1).split('.');
  const alias = normalizeAlias(parts[0]);
  const field = parts[1] ?? 'id';
  const refDesc = `${alias}.${field}`;

  // Build context for resolver
  const aliasContext: AliasContext = {
    captured: context.captured,
    aliases: context.aliases,
    userId: context.userId,
  };

  // Use centralized resolution
  const result = resolveAliasRef(normalizedRefString, aliasContext);

  if (!result.found) {
    return fail(`Unknown reference: ${refDesc}`, {
      expected: refDesc,
      actual,
    });
  }

  const expected = result.value;
  if (actual === expected) {
    return pass(`Value matches ref ${refDesc}`);
  }

  return fail(`Expected ${JSON.stringify(expected)} from ref ${refDesc}, got ${JSON.stringify(actual)}`, {
    expected,
    actual,
  });
}

/**
 * Match multiple fields against matchers.
 */
export function matchFields(
  entity: Record<string, unknown>,
  matchers: Record<string, FieldMatcher>,
  context: MatcherContext = {}
): AssertionResult {
  const failures: AssertionResult[] = [];

  for (const [field, matcher] of Object.entries(matchers)) {
    const actual = entity[field];
    const result = matchField(actual, matcher, context);

    if (!result.passed) {
      failures.push({
        ...result,
        path: field,
        message: `Field "${field}": ${result.message}`,
      });
    }
  }

  if (failures.length === 0) {
    return pass(`All ${Object.keys(matchers).length} field assertions passed`);
  }

  return fail(`${failures.length} field assertion(s) failed`, {
    context: { failures },
  });
}
