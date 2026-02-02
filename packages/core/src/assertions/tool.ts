/**
 * Tool Assertions
 *
 * Validate tool calls from agent responses.
 */

import type { ToolAssertion, SimpleToolAssertion } from '../scenario/types.js';

import { matchField, type MatcherContext } from './matchers.js';
import type { AssertionResult, ToolCall } from './types.js';
import { pass, fail, combineResults } from './types.js';

/**
 * Options for tool assertion.
 */
export interface ToolAssertionOptions {
  /** Matcher context for refs */
  context?: MatcherContext;
}

/**
 * Assert tool calls match expectations.
 *
 * Supports two formats:
 * 1. SimpleToolAssertion: { toolName: count | { min, max } }
 * 2. ToolAssertion[]: Full assertion objects
 */
export function assertToolCalls(
  toolCalls: ToolCall[],
  assertions: SimpleToolAssertion | ToolAssertion[],
  options: ToolAssertionOptions = {}
): AssertionResult {
  // Handle simple format
  if (!Array.isArray(assertions)) {
    return assertSimpleToolCalls(toolCalls, assertions);
  }

  // Handle full format
  return assertFullToolCalls(toolCalls, assertions, options);
}

/**
 * Assert simple tool call counts.
 */
function assertSimpleToolCalls(
  toolCalls: ToolCall[],
  assertions: SimpleToolAssertion
): AssertionResult {
  const results: AssertionResult[] = [];

  // Count tool calls by name
  const counts = new Map<string, number>();
  for (const call of toolCalls) {
    counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
  }

  for (const [toolName, expected] of Object.entries(assertions)) {
    const actual = counts.get(toolName) ?? 0;

    if (typeof expected === 'number') {
      // Exact count
      if (actual === expected) {
        results.push(pass(`${toolName}: called ${actual} time(s)`));
      } else {
        results.push(
          fail(`${toolName}: expected ${expected} call(s), got ${actual}`, {
            expected,
            actual,
          })
        );
      }
    } else {
      // Min/max range
      const { min, max } = expected;

      if (min !== undefined && actual < min) {
        results.push(
          fail(`${toolName}: expected at least ${min} call(s), got ${actual}`, {
            expected: `>= ${min}`,
            actual,
          })
        );
      } else if (max !== undefined && actual > max) {
        results.push(
          fail(`${toolName}: expected at most ${max} call(s), got ${actual}`, {
            expected: `<= ${max}`,
            actual,
          })
        );
      } else {
        results.push(pass(`${toolName}: called ${actual} time(s) (within range)`));
      }
    }
  }

  return combineResults(results);
}

/**
 * Assert full tool call assertions.
 */
function assertFullToolCalls(
  toolCalls: ToolCall[],
  assertions: ToolAssertion[],
  options: ToolAssertionOptions
): AssertionResult {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    const result = assertSingleTool(toolCalls, assertion, options);
    results.push(result);
  }

  return combineResults(results);
}

/**
 * Assert a single tool assertion.
 */
function assertSingleTool(
  toolCalls: ToolCall[],
  assertion: ToolAssertion,
  options: ToolAssertionOptions
): AssertionResult {
  const toolName = assertion.name;
  const matchingCalls = toolCalls.filter((c) => c.name === toolName);

  // Check notCalled
  if (assertion.notCalled) {
    if (matchingCalls.length === 0) {
      return pass(`${toolName}: not called as expected`);
    }
    return fail(`${toolName}: expected not to be called, but was called ${matchingCalls.length} time(s)`, {
      expected: 0,
      actual: matchingCalls.length,
    });
  }

  // Check count
  if (assertion.count !== undefined) {
    const expected = assertion.count;
    const actual = matchingCalls.length;

    if (typeof expected === 'number') {
      if (actual !== expected) {
        return fail(`${toolName}: expected ${expected} call(s), got ${actual}`, {
          expected,
          actual,
        });
      }
    } else {
      const { min, max } = expected;
      if (min !== undefined && actual < min) {
        return fail(`${toolName}: expected at least ${min} call(s), got ${actual}`, {
          expected: `>= ${min}`,
          actual,
        });
      }
      if (max !== undefined && actual > max) {
        return fail(`${toolName}: expected at most ${max} call(s), got ${actual}`, {
          expected: `<= ${max}`,
          actual,
        });
      }
    }
  }

  // If no calls and we expected some (or have input/output assertions)
  if (matchingCalls.length === 0) {
    if (assertion.input || assertion.output) {
      return fail(`${toolName}: expected at least one call to check input/output`, {
        expected: '>= 1',
        actual: 0,
      });
    }
    // No count specified, no calls, no input/output - could be ok
    if (assertion.count === undefined) {
      return pass(`${toolName}: no calls (no count requirement specified)`);
    }
  }

  const subResults: AssertionResult[] = [];

  // Check input assertions
  if (assertion.input) {
    for (let i = 0; i < matchingCalls.length; i++) {
      const call = matchingCalls[i];
      const inputResult = assertToolInput(call, assertion.input, options.context, i);
      subResults.push(inputResult);
    }
  }

  // Check output assertions
  if (assertion.output) {
    for (let i = 0; i < matchingCalls.length; i++) {
      const call = matchingCalls[i];
      const outputResult = assertToolOutput(call, assertion.output, options.context, i);
      subResults.push(outputResult);
    }
  }

  if (subResults.length === 0) {
    return pass(`${toolName}: ${matchingCalls.length} call(s) matched`);
  }

  return combineResults(subResults);
}

/**
 * Assert tool input matches expectations.
 */
function assertToolInput(
  call: ToolCall,
  input: Record<string, unknown>,
  context: MatcherContext = {},
  callIndex: number
): AssertionResult {
  const failures: AssertionResult[] = [];

  for (const [field, expected] of Object.entries(input)) {
    const actual = call.args[field];
    const result = matchField(actual, expected as any, context);

    if (!result.passed) {
      failures.push({
        ...result,
        path: `[${callIndex}].input.${field}`,
        message: `${call.name}[${callIndex}].input.${field}: ${result.message}`,
      });
    }
  }

  if (failures.length === 0) {
    return pass(`${call.name}[${callIndex}]: input matched`);
  }

  return fail(`${call.name}[${callIndex}]: ${failures.length} input assertion(s) failed`, {
    context: { failures },
  });
}

/**
 * Assert tool output matches expectations.
 */
function assertToolOutput(
  call: ToolCall,
  output: Record<string, unknown>,
  context: MatcherContext = {},
  callIndex: number
): AssertionResult {
  if (call.result === undefined) {
    return fail(`${call.name}[${callIndex}]: no result available to check output`, {
      expected: output,
      actual: undefined,
    });
  }

  const result = call.result;
  if (typeof result !== 'object' || result === null) {
    return fail(`${call.name}[${callIndex}]: result is not an object`, {
      expected: output,
      actual: result,
    });
  }

  const resultObj = result as Record<string, unknown>;
  const failures: AssertionResult[] = [];

  for (const [field, expected] of Object.entries(output)) {
    const actual = resultObj[field];
    const matchResult = matchField(actual, expected as any, context);

    if (!matchResult.passed) {
      failures.push({
        ...matchResult,
        path: `[${callIndex}].output.${field}`,
        message: `${call.name}[${callIndex}].output.${field}: ${matchResult.message}`,
      });
    }
  }

  if (failures.length === 0) {
    return pass(`${call.name}[${callIndex}]: output matched`);
  }

  return fail(`${call.name}[${callIndex}]: ${failures.length} output assertion(s) failed`, {
    context: { failures },
  });
}

/**
 * Count total tool calls.
 */
export function countToolCalls(toolCalls: ToolCall[]): number {
  return toolCalls.length;
}

/**
 * Assert total tool call count.
 */
export function assertTotalToolCalls(
  toolCalls: ToolCall[],
  expected: number | { min?: number; max?: number }
): AssertionResult {
  const actual = toolCalls.length;

  if (typeof expected === 'number') {
    if (actual === expected) {
      return pass(`Total tool calls: ${actual}`);
    }
    return fail(`Expected ${expected} total tool call(s), got ${actual}`, {
      expected,
      actual,
    });
  }

  const { min, max } = expected;

  if (min !== undefined && actual < min) {
    return fail(`Expected at least ${min} total tool call(s), got ${actual}`, {
      expected: `>= ${min}`,
      actual,
    });
  }

  if (max !== undefined && actual > max) {
    return fail(`Expected at most ${max} total tool call(s), got ${actual}`, {
      expected: `<= ${max}`,
      actual,
    });
  }

  return pass(`Total tool calls: ${actual} (within range)`);
}
