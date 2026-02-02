/**
 * Scenario Types
 *
 * Defines the schema for test scenario YAML files.
 */

// =============================================================================
// Field Matchers
// =============================================================================

/**
 * Literal value match (exact equality).
 */
export type LiteralValue = string | number | boolean | null;

/**
 * Contains matcher for substring or array element checking (all must match).
 */
export interface ContainsMatcher {
  contains: string | string[];
}

/**
 * Contains-any matcher for substring checking (at least one must match).
 */
export interface ContainsAnyMatcher {
  containsAny: string[];
}

/**
 * Exists matcher for null/non-null checking.
 */
export interface ExistsMatcher {
  exists: boolean;
}

/**
 * Comparison matcher for numeric comparisons.
 */
export interface ComparisonMatcher {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

/**
 * Regex matcher for pattern matching.
 */
export interface RegexMatcher {
  matches: string;
  flags?: string;
}

/**
 * Reference matcher for captured entity references.
 */
export interface RefMatcher {
  from: string; // Step label
  field?: string; // Field on captured entity (default: 'id')
}

/**
 * Union of all field matcher types.
 */
export type FieldMatcher =
  | LiteralValue
  | ContainsMatcher
  | ContainsAnyMatcher
  | ExistsMatcher
  | ComparisonMatcher
  | RegexMatcher
  | RefMatcher;

/**
 * Type guards for field matchers.
 */
export function isContainsMatcher(v: FieldMatcher): v is ContainsMatcher {
  return v !== null && typeof v === 'object' && 'contains' in v;
}

export function isContainsAnyMatcher(v: FieldMatcher): v is ContainsAnyMatcher {
  return v !== null && typeof v === 'object' && 'containsAny' in v;
}

export function isExistsMatcher(v: FieldMatcher): v is ExistsMatcher {
  return v !== null && typeof v === 'object' && 'exists' in v;
}

export function isComparisonMatcher(v: FieldMatcher): v is ComparisonMatcher {
  return (
    v !== null &&
    typeof v === 'object' &&
    ('gt' in v || 'gte' in v || 'lt' in v || 'lte' in v)
  );
}

export function isRegexMatcher(v: FieldMatcher): v is RegexMatcher {
  return v !== null && typeof v === 'object' && 'matches' in v;
}

export function isRefMatcher(v: FieldMatcher): v is RefMatcher {
  return v !== null && typeof v === 'object' && 'from' in v;
}

// =============================================================================
// Tool Assertions
// =============================================================================

/**
 * Tool count assertion (exact or range).
 */
export type ToolCountAssertion =
  | number
  | { min?: number; max?: number };

/**
 * Tool input assertion (field matching on tool arguments).
 */
export interface ToolInputAssertion {
  [field: string]: FieldMatcher;
}

/**
 * Tool output assertion (field matching on tool result).
 */
export interface ToolOutputAssertion {
  [field: string]: FieldMatcher;
}

/**
 * Full tool assertion with name, count, and input/output matching.
 */
export interface ToolAssertion {
  /** Tool name */
  name: string;
  /** Expected call count (exact or range) */
  count?: ToolCountAssertion;
  /** Assert tool was not called */
  notCalled?: boolean;
  /** Input argument matching */
  input?: ToolInputAssertion;
  /** Output result matching */
  output?: ToolOutputAssertion;
  /** Assert tool errored with message */
  error?: string;
}

/**
 * Simple tool assertion format (toolName: count).
 */
export type SimpleToolAssertion = Record<string, ToolCountAssertion>;

// =============================================================================
// Entity Assertions
// =============================================================================

/**
 * Entity field verification.
 */
export interface EntityFieldAssertion {
  [field: string]: FieldMatcher;
}

/**
 * Created entity assertion (in chat step).
 */
export interface CreatedAssertion {
  /** Entity type (e.g., 'tasks', 'reminders') */
  entity: string;
  /** Expected count (default: 1) */
  count?: number;
  /** Field assertions */
  fields?: EntityFieldAssertion;
  /** Relationship assertions */
  relationships?: string[];
  /** Alias to capture this entity */
  as?: string;
}

/**
 * Entity verification assertion (in verify step).
 */
export interface EntityVerification {
  /** Entity type (e.g., 'tasks', 'reminders') */
  entity: string;
  /** Look up by ID */
  id?: string | RefMatcher;
  /** Look up by title */
  title?: string | FieldMatcher;
  /** Field assertions */
  fields?: EntityFieldAssertion;
  /** Alias to capture this entity */
  as?: string;
  /** Assert entity does NOT exist (for deletion verification) */
  notExists?: boolean;
}

// =============================================================================
// Response Assertions
// =============================================================================

/**
 * Response text assertions.
 */
export interface ResponseAssertion {
  /** Keywords that MUST all be present (AND logic) */
  mentions?: string[];
  /** Keywords where at least ONE must be present (OR logic) */
  mentionsAny?: string[];
  /** Keywords that must NOT be present */
  notMentions?: string[];
  /** Exact substring that must be present (case-sensitive) */
  contains?: string;
  /** Substrings where at least ONE must be present (case-insensitive) */
  containsAny?: string[];
  /** Regex pattern to match */
  matches?: string;
}

// =============================================================================
// Usage Assertions
// =============================================================================

/**
 * Usage value assertion - exact number or comparison.
 */
export type UsageValue = number | ComparisonMatcher;

/**
 * Token usage assertions.
 *
 * Assert on token consumption metrics from the response.
 * Useful for validating caching behavior and monitoring token usage.
 *
 * @example
 * ```yaml
 * steps:
 *   - chat: "Create a task"
 *     usage:
 *       cacheReadTokens: { gt: 0 }  # Cache must be hit
 *       totalTokens: { lt: 30000 }   # Reasonable token limit
 * ```
 */
export interface UsageAssertion {
  /** Tokens read from cache (cache hits) */
  cacheReadTokens?: UsageValue;
  /** Tokens written to cache (cache creation) */
  cacheCreationTokens?: UsageValue;
  /** Total input tokens */
  inputTokens?: UsageValue;
  /** Total output tokens */
  outputTokens?: UsageValue;
  /** Total tokens (input + output) */
  totalTokens?: UsageValue;
  /** Number of API calls */
  callCount?: UsageValue;

  /** OR - at least one sub-assertion must pass */
  anyOf?: UsageAssertion[];
  /** AND - all sub-assertions must pass (explicit grouping) */
  allOf?: UsageAssertion[];
}

// =============================================================================
// Message Processing Assertions
// =============================================================================

/**
 * Base processor assertion - works for any processor.
 *
 * All message processors (condenser, pruner, tokenLimiter, etc.) can be
 * asserted using these common fields.
 */
export interface ProcessorAssertion {
  /** Assert processor was activated */
  activated?: boolean;
  /** Assert processor produces dynamic (uncacheable) content */
  producesDynamicContent?: boolean;
  /** OR - at least one sub-assertion must pass */
  anyOf?: ProcessorAssertion[];
  /** AND - all sub-assertions must pass (explicit grouping) */
  allOf?: ProcessorAssertion[];
}

/**
 * Condenser-specific assertions.
 *
 * The condenser compresses older messages into entity summaries.
 *
 * @example
 * ```yaml
 * steps:
 *   - chat: "What tasks do I have?"
 *     messageProcessing:
 *       condenser:
 *         activated: true
 *         condensedMessages: { gte: 4 }
 *         summaryContains: ["Tasks:", "Created:"]
 *         summaryNotContains: ["deleted task name"]
 * ```
 */
export interface CondenserAssertion extends ProcessorAssertion {
  /** Assert on number of messages condensed into summary */
  condensedMessages?: UsageValue;
  /** Assert on number of messages kept in full detail */
  recentMessages?: UsageValue;
  /** Assert on total messages before condensation */
  totalMessages?: UsageValue;
  /** Assert summary contains all of these keywords (case-insensitive) */
  summaryContains?: string[];
  /** Assert summary does NOT contain any of these keywords (case-insensitive) */
  summaryNotContains?: string[];
  /** Assert summary exists (not null) */
  summaryExists?: boolean;
  /** Assert selection mode used */
  selectionMode?: 'turn-based' | 'token-based';
}

/**
 * Pruner-specific assertions.
 *
 * The pruner removes old tool calls and reasoning from history.
 */
export interface PrunerAssertion extends ProcessorAssertion {
  /** Assert on number of message parts removed */
  partsRemoved?: UsageValue;
}

/**
 * Token limiter assertions.
 */
export interface TokenLimiterAssertion extends ProcessorAssertion {
  /** Assert on number of messages removed */
  messagesRemoved?: UsageValue;
}

/**
 * Generic message processing assertions.
 *
 * Assert on message preprocessing behavior (condensation, pruning, token limiting).
 * Each processor can report its own metadata and be asserted upon.
 *
 * @example
 * ```yaml
 * steps:
 *   - chat: "What tasks do I have?"
 *     messageProcessing:
 *       condenser:
 *         activated: true
 *         condensedMessages: { gte: 4 }
 *         summaryContains: ["Tasks:"]
 *       pruner:
 *         activated: true
 * ```
 */
export interface MessageProcessingAssertion {
  /** Condenser processor assertions */
  condenser?: CondenserAssertion;
  /** Pruner processor assertions */
  pruner?: PrunerAssertion;
  /** Token limiter processor assertions */
  tokenLimiter?: TokenLimiterAssertion;
  /** Generic processor assertions (for custom processors) */
  [processorName: string]: ProcessorAssertion | undefined;
}

// =============================================================================
// Step Types
// =============================================================================

/**
 * Base step properties.
 */
export interface StepBase {
  /** Step label for targeting and references */
  label?: string;
}

/**
 * Chat step - send a message to the agent.
 */
export interface ChatStep extends StepBase {
  /** Message to send (shorthand) */
  chat: string;

  /** Tool assertions (simple format: { manageTasks: 1 }) */
  tools?: SimpleToolAssertion | ToolAssertion[];

  /** Created entity assertions */
  created?: CreatedAssertion[];

  /** Response text assertions */
  response?: ResponseAssertion;

  /** Continue conversation from previous step */
  continueConversation?: boolean;

  /** Conversation ID to use (defaults to context) */
  conversationId?: string;

  /**
   * Named conversation for multi-conversation testing.
   *
   * - If the name exists, reuses the stored conversation ID
   * - If the name doesn't exist, creates a new conversation and stores the ID under this name
   * - If omitted, each step gets a new conversation (default behavior)
   *
   * @example
   * ```yaml
   * steps:
   *   - chat: "Create a task"
   *     conversation: conv1  # Creates new, stores ID as "conv1"
   *   - chat: "What tasks?"  # No field = new conversation
   *   - chat: "Mark it done"
   *     conversation: conv1  # Reuses stored "conv1" ID
   * ```
   */
  conversation?: string;

  /** Max tool calls before stopping (safety limit) */
  maxToolCalls?: number;

  /** Total tool calls assertion */
  totalToolCalls?: number | { min?: number; max?: number };

  /** Token usage assertions */
  usage?: UsageAssertion;

  /** Message processing metadata assertions (condenser, pruner, etc.) */
  messageProcessing?: MessageProcessingAssertion;

  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Verify step - check database state.
 */
export interface VerifyStep extends StepBase {
  /** Entity verifications (keyed by entity type) */
  verify: Record<string, EntityVerification[]>;
}

/**
 * Wait condition for polling.
 */
export interface WaitCondition {
  /** Entity type to check */
  entity: string;
  /** Entity ID to check */
  id: string | RefMatcher;
  /** Fields that must match */
  fields: EntityFieldAssertion;
}

/**
 * Wait step - poll until condition is met.
 */
export interface WaitStep extends StepBase {
  /** Wait for condition */
  wait: WaitCondition | { seconds: number };

  /** Timeout in seconds (default: 30) */
  timeoutSeconds?: number;

  /** Poll interval in seconds (default: 1) */
  intervalSeconds?: number;
}

// =============================================================================
// Vector Assertions
// =============================================================================

/**
 * Dimension matcher for vector embeddings.
 */
export interface DimensionMatcher {
  dimension: number;
}

/**
 * Simple ref matcher for YAML (e.g., { ref: "$alias.id" }).
 */
export interface SimpleRefMatcher {
  ref: string;
}

/**
 * Vector record assertion.
 *
 * Verifies a specific record in a vector collection.
 */
export interface VectorRecordAssertion {
  /** Record ID - can be literal, { ref: "$alias.id" }, or RefMatcher */
  id: string | SimpleRefMatcher | RefMatcher;
  /** Whether the record should exist */
  exists: boolean;
  /** Field assertions (only checked if exists=true) */
  fields?: {
    /** Special: verify embedding vector dimension */
    embedding?: DimensionMatcher;
    /** Any other field matchers */
    [fieldName: string]: FieldMatcher | DimensionMatcher | undefined;
  };
}

/**
 * Vector collection assertion.
 *
 * Verifies records in a vector collection.
 */
export interface VectorCollectionAssertion {
  /** Collection name (e.g., "task_embeddings", "product_vectors") */
  collection: string;
  /** Records to verify in this collection */
  records: VectorRecordAssertion[];
}

/**
 * Verify vectors step - check vector store state.
 *
 * Generic assertion step for vector databases (Milvus, Pinecone, pgvector, etc.)
 */
export interface VerifyVectorsStep extends StepBase {
  /** Vector collection verifications */
  verifyVectors: VectorCollectionAssertion[];
}

/**
 * Inline setup step (within main steps).
 */
export interface InlineSetupStep extends StepBase {
  /** Setup entities to insert */
  setup: {
    entity: string;
    data: Record<string, unknown>;
    as?: string;
  }[];
}

/**
 * Union of all step types.
 */
export type Step = ChatStep | VerifyStep | WaitStep | VerifyVectorsStep | InlineSetupStep;

/**
 * Type guards for steps.
 */
export function isChatStep(step: Step): step is ChatStep {
  return 'chat' in step;
}

export function isVerifyStep(step: Step): step is VerifyStep {
  return 'verify' in step;
}

export function isWaitStep(step: Step): step is WaitStep {
  return 'wait' in step;
}

export function isVerifyVectorsStep(step: Step): step is VerifyVectorsStep {
  return 'verifyVectors' in step;
}

export function isInlineSetupStep(step: Step): step is InlineSetupStep {
  return 'setup' in step && Array.isArray((step as InlineSetupStep).setup);
}

// =============================================================================
// Scenario Setup Steps
// =============================================================================

/**
 * Generic insert setup step.
 *
 * Inserts any entity type using the generic `insert(entity, data)` method.
 */
export interface GenericInsertSetupStep {
  insert: string;
  data: Record<string, unknown>;
  as?: string;
}

/**
 * Process action setup step.
 */
export interface ProcessSetupStep {
  process: string;
  id: string;
}

/**
 * Union of all scenario setup step types.
 */
export type ScenarioSetupStep = GenericInsertSetupStep | ProcessSetupStep;

/**
 * Type guards for setup steps.
 */
export function isInsertStep(step: ScenarioSetupStep): step is GenericInsertSetupStep {
  return 'insert' in step;
}

export function isProcessStep(step: ScenarioSetupStep): step is ProcessSetupStep {
  return 'process' in step;
}

// =============================================================================
// Scenario
// =============================================================================

/**
 * Source location for error reporting.
 */
export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
}

/**
 * A test scenario.
 */
export interface Scenario {
  /** Unique scenario ID */
  id: string;

  /** Human-readable name */
  name?: string;

  /** Description */
  description?: string;

  /** Tags for filtering */
  tags?: string[];

  /** Setup steps (run before main steps) */
  setup?: ScenarioSetupStep[];

  /** Main test steps */
  steps: Step[];

  /** Override default user ID */
  userId?: string;

  /** Override default timeout */
  timeout?: number;

  /** Run scenario multiple times (for flakiness/hallucination detection) */
  runs?: number;

  /** Source location for error reporting */
  source?: SourceLocation;
}

// =============================================================================
// Suite Configuration
// =============================================================================

/**
 * Suite configuration from suite.yaml.
 */
export interface SuiteConfig {
  /** Suite name */
  name?: string;

  /** Scenario file patterns */
  scenarios: string[];

  /** Base directory for scenario files */
  baseDir?: string;

  /** Default tags to apply */
  defaultTags?: string[];

  /** Default timeout */
  defaultTimeout?: number;
}

/**
 * Filter options for running scenarios.
 */
export interface FilterOptions {
  /** Run only scenario with this ID */
  id?: string;

  /** Run scenarios with these tags */
  tags?: string[];

  /** Run scenarios matching this pattern */
  grep?: string;

  /** Run up to this step label only */
  targetStep?: string;
}
