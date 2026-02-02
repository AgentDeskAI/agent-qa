/**
 * Message Processing Assertions
 *
 * Validate message processing metadata from agent responses.
 * Useful for verifying condenser, pruner, and token limiter behavior.
 */

import type {
  MessageProcessingAssertion,
  ProcessorAssertion,
  CondenserAssertion,
  PrunerAssertion,
  TokenLimiterAssertion,
  UsageValue,
  ComparisonMatcher,
} from '../scenario/types.js';
import { isComparisonMatcher } from '../scenario/types.js';

import type { AssertionResult } from './types.js';
import { pass, fail, combineResults } from './types.js';

// =============================================================================
// Types for actual metadata from API response
// =============================================================================

/**
 * Base processor metadata from API response.
 */
export interface ProcessorMetadata {
  activated: boolean;
  producesDynamicContent?: boolean;
}

/**
 * Condenser processor metadata from API response.
 */
export interface CondenserProcessorMetadata extends ProcessorMetadata {
  totalMessages: number;
  recentMessages: number;
  condensedMessages: number;
  selectionMode: 'turn-based' | 'token-based';
  summary: string | null;
}

/**
 * Pruner processor metadata from API response.
 */
export interface PrunerProcessorMetadata extends ProcessorMetadata {
  partsRemoved: number;
}

/**
 * Token limiter processor metadata from API response.
 */
export interface TokenLimiterProcessorMetadata extends ProcessorMetadata {
  messagesRemoved?: number;
}

/**
 * Message processing metadata from API response.
 */
export interface MessageProcessingMetadata {
  processors: {
    condenser?: CondenserProcessorMetadata;
    pruner?: PrunerProcessorMetadata;
    tokenLimiter?: TokenLimiterProcessorMetadata;
    [key: string]: ProcessorMetadata | undefined;
  };
}

// =============================================================================
// Main assertion function
// =============================================================================

/**
 * Assert message processing metadata matches expectations.
 *
 * @example
 * ```typescript
 * assertMessageProcessing(response.messageProcessing, {
 *   condenser: {
 *     activated: true,
 *     condensedMessages: { gte: 4 },
 *     summaryContains: ["Tasks:"],
 *   },
 * });
 * ```
 */
export function assertMessageProcessing(
  actual: MessageProcessingMetadata | undefined,
  expected: MessageProcessingAssertion
): AssertionResult {
  if (!actual) {
    return fail('No message processing metadata available', {
      expected,
      actual: undefined,
    });
  }

  const results: AssertionResult[] = [];

  // Check each processor assertion
  for (const [processorName, assertion] of Object.entries(expected)) {
    if (assertion === undefined) continue;

    const processorData = actual.processors[processorName];

    // Route to specific assertion handler based on processor type
    switch (processorName) {
      case 'condenser':
        results.push(
          assertCondenser(processorData as CondenserProcessorMetadata | undefined, assertion as CondenserAssertion)
        );
        break;
      case 'pruner':
        results.push(
          assertPruner(processorData as PrunerProcessorMetadata | undefined, assertion as PrunerAssertion)
        );
        break;
      case 'tokenLimiter':
        results.push(
          assertTokenLimiter(processorData as TokenLimiterProcessorMetadata | undefined, assertion as TokenLimiterAssertion)
        );
        break;
      default:
        results.push(
          assertGenericProcessor(processorName, processorData, assertion)
        );
    }
  }

  if (results.length === 0) {
    return pass('No message processing assertions to check');
  }

  return combineResults(results);
}

// =============================================================================
// Condenser assertions
// =============================================================================

/**
 * Assert condenser processor metadata.
 */
function assertCondenser(
  actual: CondenserProcessorMetadata | undefined,
  expected: CondenserAssertion
): AssertionResult {
  if (!actual) {
    // If we're asserting activated: false, that's a pass
    if (expected.activated === false) {
      return pass('condenser: not activated (as expected)');
    }
    return fail('condenser: no metadata available', {
      expected,
      actual: undefined,
    });
  }

  const results: AssertionResult[] = [];

  // Base processor assertions
  results.push(...assertBaseProcessor('condenser', actual, expected));

  // Condenser-specific assertions
  if (expected.condensedMessages !== undefined) {
    results.push(
      assertNumericField('condenser.condensedMessages', actual.condensedMessages, expected.condensedMessages)
    );
  }

  if (expected.recentMessages !== undefined) {
    results.push(
      assertNumericField('condenser.recentMessages', actual.recentMessages, expected.recentMessages)
    );
  }

  if (expected.totalMessages !== undefined) {
    results.push(
      assertNumericField('condenser.totalMessages', actual.totalMessages, expected.totalMessages)
    );
  }

  if (expected.selectionMode !== undefined) {
    if (actual.selectionMode === expected.selectionMode) {
      results.push(pass(`condenser.selectionMode: ${actual.selectionMode}`));
    } else {
      results.push(fail(`condenser.selectionMode: expected ${expected.selectionMode}, got ${actual.selectionMode}`, {
        expected: expected.selectionMode,
        actual: actual.selectionMode,
      }));
    }
  }

  if (expected.summaryExists !== undefined) {
    const hasSummary = actual.summary !== null;
    if (hasSummary === expected.summaryExists) {
      results.push(pass(`condenser.summaryExists: ${hasSummary}`));
    } else {
      results.push(fail(`condenser.summaryExists: expected ${expected.summaryExists}, got ${hasSummary}`, {
        expected: expected.summaryExists,
        actual: hasSummary,
      }));
    }
  }

  if (expected.summaryContains && expected.summaryContains.length > 0) {
    results.push(assertSummaryContains(actual.summary, expected.summaryContains));
  }

  if (expected.summaryNotContains && expected.summaryNotContains.length > 0) {
    results.push(assertSummaryNotContains(actual.summary, expected.summaryNotContains));
  }

  return combineResults(results);
}

/**
 * Assert summary contains all specified keywords (case-insensitive).
 */
function assertSummaryContains(
  summary: string | null,
  keywords: string[]
): AssertionResult {
  if (summary === null) {
    return fail('condenser.summaryContains: summary is null', {
      expected: keywords,
      actual: null,
    });
  }

  const lowerSummary = summary.toLowerCase();
  const missing = keywords.filter(k => !lowerSummary.includes(k.toLowerCase()));

  if (missing.length === 0) {
    return pass(`condenser.summaryContains: all ${keywords.length} keywords found`);
  }

  return fail(`condenser.summaryContains: missing keywords: ${missing.join(', ')}`, {
    expected: keywords,
    actual: missing,
    context: { summarySnippet: summary.substring(0, 200) },
  });
}

/**
 * Assert summary does NOT contain any of the specified keywords (case-insensitive).
 */
function assertSummaryNotContains(
  summary: string | null,
  keywords: string[]
): AssertionResult {
  if (summary === null) {
    return pass('condenser.summaryNotContains: summary is null (no keywords possible)');
  }

  const lowerSummary = summary.toLowerCase();
  const found = keywords.filter(k => lowerSummary.includes(k.toLowerCase()));

  if (found.length === 0) {
    return pass(`condenser.summaryNotContains: none of ${keywords.length} forbidden keywords found`);
  }

  return fail(`condenser.summaryNotContains: found forbidden keywords: ${found.join(', ')}`, {
    expected: `none of: ${keywords.join(', ')}`,
    actual: found,
    context: { summarySnippet: summary.substring(0, 200) },
  });
}

// =============================================================================
// Pruner assertions
// =============================================================================

/**
 * Assert pruner processor metadata.
 */
function assertPruner(
  actual: PrunerProcessorMetadata | undefined,
  expected: PrunerAssertion
): AssertionResult {
  if (!actual) {
    if (expected.activated === false) {
      return pass('pruner: not activated (as expected)');
    }
    return fail('pruner: no metadata available', {
      expected,
      actual: undefined,
    });
  }

  const results: AssertionResult[] = [];

  // Base processor assertions
  results.push(...assertBaseProcessor('pruner', actual, expected));

  // Pruner-specific assertions
  if (expected.partsRemoved !== undefined) {
    results.push(
      assertNumericField('pruner.partsRemoved', actual.partsRemoved, expected.partsRemoved)
    );
  }

  return combineResults(results);
}

// =============================================================================
// Token limiter assertions
// =============================================================================

/**
 * Assert token limiter processor metadata.
 */
function assertTokenLimiter(
  actual: TokenLimiterProcessorMetadata | undefined,
  expected: TokenLimiterAssertion
): AssertionResult {
  if (!actual) {
    if (expected.activated === false) {
      return pass('tokenLimiter: not activated (as expected)');
    }
    return fail('tokenLimiter: no metadata available', {
      expected,
      actual: undefined,
    });
  }

  const results: AssertionResult[] = [];

  // Base processor assertions
  results.push(...assertBaseProcessor('tokenLimiter', actual, expected));

  // Token limiter-specific assertions
  if (expected.messagesRemoved !== undefined) {
    results.push(
      assertNumericField('tokenLimiter.messagesRemoved', actual.messagesRemoved, expected.messagesRemoved)
    );
  }

  return combineResults(results);
}

// =============================================================================
// Generic processor assertions
// =============================================================================

/**
 * Assert a generic processor's metadata.
 */
function assertGenericProcessor(
  name: string,
  actual: ProcessorMetadata | undefined,
  expected: ProcessorAssertion
): AssertionResult {
  if (!actual) {
    if (expected.activated === false) {
      return pass(`${name}: not activated (as expected)`);
    }
    return fail(`${name}: no metadata available`, {
      expected,
      actual: undefined,
    });
  }

  const results = assertBaseProcessor(name, actual, expected);
  return combineResults(results);
}

/**
 * Assert base processor fields (activated, producesDynamicContent, anyOf, allOf).
 */
function assertBaseProcessor(
  prefix: string,
  actual: ProcessorMetadata,
  expected: ProcessorAssertion
): AssertionResult[] {
  const results: AssertionResult[] = [];

  // Check activated
  if (expected.activated !== undefined) {
    if (actual.activated === expected.activated) {
      results.push(pass(`${prefix}.activated: ${actual.activated}`));
    } else {
      results.push(fail(`${prefix}.activated: expected ${expected.activated}, got ${actual.activated}`, {
        expected: expected.activated,
        actual: actual.activated,
      }));
    }
  }

  // Check producesDynamicContent
  if (expected.producesDynamicContent !== undefined) {
    if (actual.producesDynamicContent === expected.producesDynamicContent) {
      results.push(pass(`${prefix}.producesDynamicContent: ${actual.producesDynamicContent}`));
    } else {
      results.push(fail(`${prefix}.producesDynamicContent: expected ${expected.producesDynamicContent}, got ${actual.producesDynamicContent}`, {
        expected: expected.producesDynamicContent,
        actual: actual.producesDynamicContent,
      }));
    }
  }

  // Handle anyOf (OR logic) - not commonly used but supported
  if (expected.anyOf && expected.anyOf.length > 0) {
    const subResults = expected.anyOf.map(sub => {
      const subAssertions = assertBaseProcessor(prefix, actual, sub);
      return combineResults(subAssertions);
    });
    const passed = subResults.filter(r => r.passed);

    if (passed.length > 0) {
      results.push(pass(`${prefix}.anyOf: ${passed.length} of ${expected.anyOf.length} conditions passed`));
    } else {
      const failMessages = subResults.map(r => r.message).join('; ');
      results.push(fail(`${prefix}.anyOf failed: none of ${expected.anyOf.length} conditions passed: ${failMessages}`, {
        expected: 'at least one condition to pass',
        actual: 'all conditions failed',
      }));
    }
  }

  // Handle allOf (explicit AND logic)
  if (expected.allOf && expected.allOf.length > 0) {
    const subResults = expected.allOf.map(sub => {
      const subAssertions = assertBaseProcessor(prefix, actual, sub);
      return combineResults(subAssertions);
    });
    const failed = subResults.filter(r => !r.passed);

    if (failed.length === 0) {
      results.push(pass(`${prefix}.allOf: all ${expected.allOf.length} conditions passed`));
    } else {
      const failMessages = failed.map(r => r.message).join('; ');
      results.push(fail(`${prefix}.allOf failed: ${failed.length} of ${expected.allOf.length} conditions failed: ${failMessages}`, {
        expected: 'all conditions to pass',
        actual: `${failed.length} failed`,
      }));
    }
  }

  return results;
}

// =============================================================================
// Numeric field assertions (reusing UsageValue pattern)
// =============================================================================

/**
 * Assert a numeric field value (supports exact or comparison matchers).
 */
function assertNumericField(
  fieldName: string,
  actual: number | undefined,
  expected: UsageValue
): AssertionResult {
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
