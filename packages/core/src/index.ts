/**
 * @agent-qa/core
 *
 * Framework-based AI agent testing with convention over configuration.
 *
 * @example
 * ```typescript
 * // agent-qa.config.ts
 * import { defineConfig } from '@agent-qa/core';
 * import * as schema from '@myapp/db/schema';
 *
 * export default defineConfig({
 *   name: 'MyApp',
 *   agent: {
 *     baseUrl: '$API_URL',
 *     token: '$API_TOKEN',
 *   },
 *   database: {
 *     url: '$DATABASE_URL',
 *     entities: [
 *       { table: schema.tasks, name: 'tasks', titleColumn: 'title' },
 *     ],
 *   },
 * });
 * ```
 *
 * Then run:
 * ```bash
 * npx agent-qa run suite.yaml --id test-001
 * npx agent-qa chat -m "create a task"
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Configuration
// =============================================================================

export {
  defineConfig,
  loadConfig,
  findConfigFile,
  hasConfigFile,
  getConfigDir,
  resolveConfig,
  validateConfig,
  resolveEnvVar,
} from './config/index.js';

export type {
  AgentQAConfig,
  ResolvedConfig,
  EntityConfig,
  AgentConfig,
  DatabaseConfig,
  SetupConfig,
  ProcessResult,
  RelationshipPattern,
  ReporterConfig,
  // Lifecycle hooks
  LifecycleHooks,
  ScenarioInfo,
  ScenarioResultInfo,
  // Diagnostics config types
  DiagnosticsConfig,
  DiagnosticsConfigObject,
  TmuxDiagnosticsConfig,
  TracesDiagnosticsConfig,
  DockerDiagnosticsConfig,
  FileDiagnosticsConfig,
  // Reporter config types
  ReportsConfig,
  MarkdownReporterConfig as MarkdownReporterConfigType,
} from './config/index.js';

// =============================================================================
// Scenario
// =============================================================================

export {
  // Parser
  parseScenarioFile,
  parseScenario,
  parseScenarioFiles,
  ParseError,
  // Suite management
  loadSuiteConfig,
  loadSuiteScenarios,
  filterScenarios,
  truncateToStep,
  getScenarioSummary,
  getAllTags,
  groupByTag,
  findStepByLabel,
  getStepIndex,
  // Setup
  createAliasRegistry,
  runSetupSteps,
  isInsertStep,
  isProcessStepType,
  // Type guards
  isContainsMatcher,
  isExistsMatcher,
  isComparisonMatcher,
  isRegexMatcher,
  isRefMatcher,
  isChatStep,
  isVerifyStep,
  isWaitStep,
  isInlineSetupStep,
} from './scenario/index.js';

export type {
  // Field matchers
  LiteralValue,
  ContainsMatcher,
  ExistsMatcher,
  ComparisonMatcher,
  RegexMatcher,
  RefMatcher,
  FieldMatcher,
  // Tool assertions
  ToolCountAssertion,
  ToolInputAssertion,
  ToolOutputAssertion,
  ToolAssertion,
  SimpleToolAssertion,
  // Entity assertions
  EntityFieldAssertion,
  CreatedAssertion,
  EntityVerification,
  // Response assertions
  ResponseAssertion,
  // Steps
  StepBase,
  ChatStep,
  VerifyStep,
  WaitCondition,
  WaitStep,
  InlineSetupStep,
  Step,
  // Setup steps (generic only - entity-specific types removed)
  GenericInsertSetupStep,
  ProcessSetupStep,
  ScenarioSetupStep,
  // Scenario
  SourceLocation,
  Scenario,
  SuiteConfig,
  FilterOptions,
  // Setup executor
  AliasEntry,
  AliasResolutionContext,
  AliasRegistry,
  SetupExecutor,
  SetupResult,
  RunSetupOptions,
} from './scenario/index.js';

// =============================================================================
// Assertions
// =============================================================================

export {
  // Types & helpers
  pass,
  fail,
  combineResults,
  // Matchers
  matchField,
  matchFields,
  // Tool assertions
  assertToolCalls,
  assertTotalToolCalls,
  countToolCalls,
  // Entity assertions
  verifyEntity,
  assertCreatedEntities,
  verifyEntities,
  assertEntityCount,
  // Response assertions
  assertResponse,
  isErrorResponse,
  extractMentionedEntities,
  // Relationship assertions
  parseRelationship,
  assertRelationship,
  extractRelationships,
  validateRelationships,
  defaultRelationshipPatterns,
  // Wait assertions
  waitFor,
  waitForEntity,
  waitForEntityCount,
  executeWaitCondition,
} from './assertions/index.js';

export type {
  AssertionResult,
  ToolCall,
  EntityRow,
  QueryResult,
  MatcherContext,
  ToolAssertionOptions,
  EntityQueryAdapter,
  VerifyEntityOptions,
  ParsedRelationship,
  WaitOptions,
} from './assertions/index.js';

// =============================================================================
// Adapters
// =============================================================================

export {
  // HTTP Agent
  createHttpAgent,
  createHttpAgentFromConfig,
  // Drizzle Database Adapter
  createDrizzleAdapter,
} from './adapters/index.js';

export type {
  // Agent types
  ChatOptions,
  TokenUsage,
  AgentResponse,
  AgentAdapter,
  HttpAgentOptions,
  // Database types
  EntitySchema,
  DatabaseAdapter,
  DrizzleAdapterOptions,
  // Setup types
  SetupProcessResult,
  CombinedAdapter,
} from './adapters/index.js';

// =============================================================================
// Runner
// =============================================================================

export {
  // Context
  ExecutionContext,
  // Runner
  TestRunner,
  createTestRunner,
  // Step executors
  executeChatStep,
  executeVerifyStep,
  executeWaitStep,
  executeSetupStep,
} from './runner/index.js';

export type {
  // Step reports
  StepStatus,
  StepReportBase,
  ChatStepReport,
  VerifyStepReport,
  WaitStepReport,
  SetupStepReport,
  StepReport,
  // Scenario reports
  ScenarioStatus,
  ScenarioReport,
  SuiteReport,
  // Options
  RunScenarioOptions,
  RunSuiteOptions,
  RunResult,
  CapturedState,
  // Context
  ExecutionContextOptions,
  // Runner
  TestRunnerOptions,
  // Step executors
  ExecuteChatStepOptions,
  ExecuteVerifyStepOptions,
  ExecuteWaitStepOptions,
  ExecuteSetupStepOptions,
} from './runner/index.js';

// =============================================================================
// Lifecycle
// =============================================================================

export {
  // Preflight
  quickPreflightCheck,
  // Global setup
  runGlobalSetup,
  runTeardown,
} from './lifecycle/index.js';

export type {
  // Preflight
  PreflightOptions,
  PreflightResult,
  // Global setup
  TeardownFn,
  GlobalSetupModule,
  GlobalSetupOptions,
} from './lifecycle/index.js';

// =============================================================================
// Reporters
// =============================================================================

export {
  // Console Reporter
  ConsoleReporter,
  createConsoleReporter,
  // Markdown Reporter
  createMarkdownReporter,
} from './reporters/index.js';

export type {
  Reporter,
  ReporterOptions,
  ConsoleReporterOptions,
  MarkdownReporterConfig,
} from './reporters/index.js';

// =============================================================================
// Tracking
// =============================================================================

export type {
  TokenUsage as TrackerTokenUsage,
  ModelUsage,
  CostInfo,
  UsageTracker,
  TrackUsageOptions,
  ModelPricing,
  UsageTrackerOptions,
} from './tracking/index.js';

// =============================================================================
// Diagnostics
// =============================================================================

export {
  // Raw diagnostics writer
  writeRawDiagnostics,
  appendTempoTraces,
  readFailureMetadata,
  createRawDiagnosticsWriter,
  // Tmux provider
  createTmuxLogProvider,
  captureTmuxLogs,
  clearTmuxBuffer,
  hasTmuxSession,
  // Generic traces provider
  createTracesDiagnosticsProvider,
  collectTracesForCorrelationIds,
} from './diagnostics/index.js';

export type {
  FailureContext,
  DiagnosticsData,
  DiagnosticsProvider,
  DiagnosticsConfig as DiagnosticsProviderConfig,
  TmuxConfig,
  FailureMetadata,
  HttpResponseData,
  RawDiagnosticsData,
  WriteResult,
  // Trace data types
  EnrichedTraceData,
  WorkflowData,
} from './diagnostics/index.js';

// =============================================================================
// Traces (TracesProvider interface)
// =============================================================================

export type {
  TracesProvider,
  TracesProviderConfig,
  TracesProviderStatus,
  TraceSearchOptions,
  ParsedTrace,
  ParsedSpan,
  SpanEvent,
  TraceMetrics,
  TraceSearchResult,
  SpanType,
  SpanStatus,
} from './traces/index.js';
