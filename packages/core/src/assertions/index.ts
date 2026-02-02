/**
 * Assertions Module
 *
 * Validation logic for tool calls, entities, responses, and wait conditions.
 */

// Types
export type {
  AssertionResult,
  ToolCall,
  EntityRow,
  QueryResult,
} from './types.js';

export { pass, fail, combineResults } from './types.js';

// Matchers
export type { MatcherContext } from './matchers.js';

export { matchField, matchFields } from './matchers.js';

// Tool assertions
export type { ToolAssertionOptions } from './tool.js';

export { assertToolCalls, assertTotalToolCalls, countToolCalls } from './tool.js';

// Entity assertions
export type { EntityQueryAdapter, VerifyEntityOptions } from './entity.js';

export {
  verifyEntity,
  assertCreatedEntities,
  verifyEntities,
  assertEntityCount,
} from './entity.js';

// Response assertions
export {
  assertResponse,
  isErrorResponse,
  extractMentionedEntities,
} from './response.js';

// Relationship assertions
export type { ParsedRelationship } from './relationship.js';

export {
  parseRelationship,
  assertRelationship,
  extractRelationships,
  validateRelationships,
  defaultRelationshipPatterns,
} from './relationship.js';

// Wait assertions
export type { WaitOptions } from './wait.js';

export {
  waitFor,
  waitForEntity,
  waitForEntityCount,
  executeWaitCondition,
} from './wait.js';

// Usage assertions
export type { UsageTotals } from './usage.js';

export { assertUsage } from './usage.js';

// Message processing assertions
export type {
  ProcessorMetadata,
  CondenserProcessorMetadata,
  PrunerProcessorMetadata,
  TokenLimiterProcessorMetadata,
  MessageProcessingMetadata,
} from './message-processing.js';

export { assertMessageProcessing } from './message-processing.js';
