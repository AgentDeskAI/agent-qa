/**
 * Verify Vectors Step Executor
 *
 * Executes verify vectors steps to check vector store state.
 * Generic implementation that works with any vector database.
 */

import type { VectorStoreAdapter } from '../../adapters/types.js';
import type { AssertionResult } from '../../assertions/types.js';
import { pass, fail, combineResults } from '../../assertions/types.js';
import { matchField, type MatcherContext } from '../../assertions/matchers.js';
import type {
  VerifyVectorsStep,
  VectorCollectionAssertion,
  VectorRecordAssertion,
  DimensionMatcher,
  FieldMatcher,
  SimpleRefMatcher,
} from '../../scenario/types.js';
import { isRefMatcher } from '../../scenario/types.js';

/**
 * Check if a value is a SimpleRefMatcher.
 */
function isSimpleRefMatcher(v: unknown): v is SimpleRefMatcher {
  return v !== null && typeof v === 'object' && 'ref' in v && typeof (v as { ref: unknown }).ref === 'string';
}
import type { ExecutionContext } from '../context.js';
import type { VerifyVectorsStepReport } from '../types.js';

/**
 * Options for executing a verify vectors step.
 */
export interface ExecuteVerifyVectorsStepOptions {
  /** Step to execute */
  step: VerifyVectorsStep;
  /** Execution context */
  context: ExecutionContext;
  /** Vector store adapter */
  vectorStore: VectorStoreAdapter;
  /** Step index */
  index: number;
}

/**
 * Check if a matcher is a dimension matcher.
 */
function isDimensionMatcher(matcher: unknown): matcher is DimensionMatcher {
  return (
    matcher !== null &&
    typeof matcher === 'object' &&
    'dimension' in matcher &&
    typeof (matcher as DimensionMatcher).dimension === 'number'
  );
}

/**
 * Resolve a record ID from the assertion (may be literal or reference).
 */
function resolveRecordId(
  idAssertion: VectorRecordAssertion['id'],
  context: ExecutionContext,
): string | null {
  // Direct string ID
  if (typeof idAssertion === 'string') {
    // Check if it's a reference like "$alias.id"
    if (idAssertion.startsWith('$')) {
      return context.resolve(idAssertion);
    }
    return idAssertion;
  }

  // SimpleRefMatcher format: { ref: "$alias.id" }
  if (isSimpleRefMatcher(idAssertion)) {
    return context.resolve(idAssertion.ref);
  }

  // RefMatcher format: { from: alias, field: fieldName }
  if (isRefMatcher(idAssertion)) {
    const alias = idAssertion.from;
    const field = idAssertion.field ?? 'id';
    const captured = context.getCaptured(alias);
    if (captured) {
      return String(captured[field] ?? captured.id);
    }
    const aliasEntry = context.getAlias(alias);
    if (aliasEntry && field === 'id') {
      return aliasEntry.id;
    }
    return null;
  }

  return null;
}

/**
 * Verify a single record in a collection.
 */
async function verifyRecord(
  vectorStore: VectorStoreAdapter,
  collection: string,
  assertion: VectorRecordAssertion,
  context: ExecutionContext,
  matcherContext: MatcherContext,
): Promise<AssertionResult> {
  // Resolve the record ID
  const id = resolveRecordId(assertion.id, context);
  if (!id) {
    return fail(`[${collection}] Could not resolve record ID from assertion`, {
      expected: assertion.id,
      actual: null,
    });
  }

  // Fetch the record
  const record = await vectorStore.findById(collection, id);

  // Check existence
  if (assertion.exists && !record) {
    return fail(`[${collection}] Record not found: id=${id}`, {
      expected: 'record exists',
      actual: null,
    });
  }

  if (!assertion.exists && record) {
    return fail(`[${collection}] Record exists but should not: id=${id}`, {
      expected: 'record does not exist',
      actual: record,
    });
  }

  // If we expected it to not exist and it doesn't, that's a pass
  if (!assertion.exists && !record) {
    return pass(`[${collection}] Record does not exist as expected: id=${id}`);
  }

  // If no field assertions, we're done
  if (!assertion.fields) {
    return pass(`[${collection}] Record exists: id=${id}`);
  }

  // Verify fields
  const fieldErrors: string[] = [];

  for (const [fieldName, matcher] of Object.entries(assertion.fields)) {
    if (matcher === undefined) continue;

    // Special case: embedding dimension check
    if (fieldName === 'embedding' && isDimensionMatcher(matcher)) {
      const dim = record!.embedding?.length ?? 0;
      if (dim !== matcher.dimension) {
        fieldErrors.push(
          `embedding dimension mismatch: expected ${matcher.dimension}, got ${dim}`,
        );
      }
      continue;
    }

    // Regular field matching
    const actualValue = record!.fields[fieldName];
    const result = matchField(actualValue, matcher as FieldMatcher, matcherContext);
    if (!result.passed) {
      fieldErrors.push(`${fieldName}: ${result.message}`);
    }
  }

  if (fieldErrors.length > 0) {
    return fail(`[${collection}] id=${id}: ${fieldErrors.join('; ')}`, {
      expected: assertion.fields,
      actual: record!.fields,
    });
  }

  return pass(`[${collection}] Record verified: id=${id}`);
}

/**
 * Verify a collection's records.
 */
async function verifyCollection(
  vectorStore: VectorStoreAdapter,
  assertion: VectorCollectionAssertion,
  context: ExecutionContext,
  matcherContext: MatcherContext,
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const recordAssertion of assertion.records) {
    const result = await verifyRecord(
      vectorStore,
      assertion.collection,
      recordAssertion,
      context,
      matcherContext,
    );
    results.push(result);
  }

  return results;
}

/**
 * Execute a verify vectors step.
 */
export async function executeVerifyVectorsStep(
  options: ExecuteVerifyVectorsStepOptions,
): Promise<VerifyVectorsStepReport> {
  const { step, context, vectorStore, index } = options;
  const startTime = Date.now();
  const allAssertions: AssertionResult[] = [];

  try {
    if (context.verbose) {
      const collections = step.verifyVectors.map((v) => v.collection);
      console.log(`  Verify Vectors: ${collections.join(', ')}`);
    }

    // Count totals for the report
    let collectionsVerified = 0;
    let recordsVerified = 0;

    const matcherContext = context.getMatcherContext();

    // Verify each collection
    for (const collectionAssertion of step.verifyVectors) {
      collectionsVerified++;
      recordsVerified += collectionAssertion.records.length;

      const results = await verifyCollection(
        vectorStore,
        collectionAssertion,
        context,
        matcherContext,
      );
      allAssertions.push(...results);
    }

    // Combine all results
    const combined = combineResults(allAssertions);
    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'verify-vectors',
      status: combined.passed ? 'passed' : 'failed',
      durationMs,
      error: combined.passed ? undefined : combined.message,
      assertions: allAssertions,
      collectionsVerified,
      recordsVerified,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'verify-vectors',
      status: 'error',
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      assertions: allAssertions,
      collectionsVerified: 0,
      recordsVerified: 0,
    };
  }
}
