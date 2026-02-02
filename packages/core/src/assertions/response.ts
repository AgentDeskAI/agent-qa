/**
 * Response Assertions
 *
 * Validate response text from agent.
 */

import type { ResponseAssertion } from '../scenario/types.js';

import type { AssertionResult } from './types.js';
import { pass, fail, combineResults } from './types.js';

/**
 * Assert response text matches expectations.
 */
export function assertResponse(
  responseText: string,
  assertion: ResponseAssertion
): AssertionResult {
  const results: AssertionResult[] = [];

  // Check mentions (AND logic - all must be present)
  if (assertion.mentions) {
    const mentions = Array.isArray(assertion.mentions)
      ? assertion.mentions
      : [assertion.mentions];

    for (const mention of mentions) {
      const result = assertMentions(responseText, mention);
      results.push(result);
    }
  }

  // Check mentionsAny (OR logic - at least one must be present)
  if (assertion.mentionsAny) {
    const result = assertMentionsAny(responseText, assertion.mentionsAny);
    results.push(result);
  }

  // Check notMentions
  if (assertion.notMentions) {
    const notMentions = Array.isArray(assertion.notMentions)
      ? assertion.notMentions
      : [assertion.notMentions];

    for (const notMention of notMentions) {
      const result = assertNotMentions(responseText, notMention);
      results.push(result);
    }
  }

  // Check contains (case-sensitive substring)
  if (assertion.contains) {
    const contains = Array.isArray(assertion.contains)
      ? assertion.contains
      : [assertion.contains];

    for (const contain of contains) {
      const result = assertContains(responseText, contain);
      results.push(result);
    }
  }

  // Check containsAny (OR logic, case-insensitive)
  if (assertion.containsAny) {
    const result = assertContainsAny(responseText, assertion.containsAny);
    results.push(result);
  }

  // Check matches (regex)
  if (assertion.matches) {
    const result = assertRegex(responseText, assertion.matches);
    results.push(result);
  }

  if (results.length === 0) {
    return pass('No response assertions specified');
  }

  return combineResults(results);
}

/**
 * Assert response mentions a term (case-insensitive word boundary).
 */
function assertMentions(responseText: string, term: string): AssertionResult {
  // Use word boundary matching for natural language
  const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');

  if (regex.test(responseText)) {
    return pass(`Response mentions "${term}"`);
  }

  return fail(`Response does not mention "${term}"`, {
    expected: `mentions "${term}"`,
    actual: truncateText(responseText, 100),
  });
}

/**
 * Assert response does not mention a term.
 */
function assertNotMentions(responseText: string, term: string): AssertionResult {
  const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');

  if (!regex.test(responseText)) {
    return pass(`Response does not mention "${term}"`);
  }

  return fail(`Response unexpectedly mentions "${term}"`, {
    expected: `does not mention "${term}"`,
    actual: truncateText(responseText, 100),
  });
}

/**
 * Assert response mentions at least one of the terms (OR logic).
 */
function assertMentionsAny(responseText: string, terms: string[]): AssertionResult {
  for (const term of terms) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    if (regex.test(responseText)) {
      return pass(`Response mentions "${term}" (1 of ${terms.length} options)`);
    }
  }

  return fail(`Response does not mention any of: ${terms.join(', ')}`, {
    expected: `mentions one of: ${terms.join(', ')}`,
    actual: truncateText(responseText, 100),
  });
}

/**
 * Assert response contains exact substring.
 */
function assertContains(responseText: string, substring: string): AssertionResult {
  if (responseText.includes(substring)) {
    return pass(`Response contains "${truncateText(substring, 30)}"`);
  }

  return fail(`Response does not contain "${truncateText(substring, 30)}"`, {
    expected: `contains "${substring}"`,
    actual: truncateText(responseText, 100),
  });
}

/**
 * Assert response contains at least one substring (OR logic, case-insensitive).
 */
function assertContainsAny(responseText: string, substrings: string[]): AssertionResult {
  const lowerResponse = responseText.toLowerCase();

  for (const substring of substrings) {
    if (lowerResponse.includes(substring.toLowerCase())) {
      return pass(`Response contains "${substring}" (1 of ${substrings.length} options)`);
    }
  }

  return fail(`Response does not contain any of: ${substrings.join(', ')}`, {
    expected: `contains one of: ${substrings.join(', ')}`,
    actual: truncateText(responseText, 100),
  });
}

/**
 * Assert response matches regex.
 */
function assertRegex(responseText: string, pattern: string): AssertionResult {
  try {
    const regex = new RegExp(pattern, 'i');

    if (regex.test(responseText)) {
      return pass(`Response matches /${pattern}/`);
    }

    return fail(`Response does not match /${pattern}/`, {
      expected: `matches /${pattern}/`,
      actual: truncateText(responseText, 100),
    });
  } catch (error) {
    return fail(`Invalid regex pattern: ${pattern}`, {
      expected: 'valid regex',
      actual: String(error),
    });
  }
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Truncate text for display.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Check if response indicates an error.
 */
export function isErrorResponse(responseText: string): boolean {
  const errorPatterns = [
    /\berror\b/i,
    /\bfailed\b/i,
    /\bcannot\b/i,
    /\bunable to\b/i,
    /\bsomething went wrong\b/i,
    /\bI'm sorry.*but\b/i,
  ];

  return errorPatterns.some((pattern) => pattern.test(responseText));
}

/**
 * Extract mentioned entities from response text.
 */
export function extractMentionedEntities(
  responseText: string,
  entityNames: string[]
): string[] {
  const mentioned: string[] = [];

  for (const name of entityNames) {
    const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
    if (regex.test(responseText)) {
      mentioned.push(name);
    }
  }

  return mentioned;
}
