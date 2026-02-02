/**
 * Scenario Module
 *
 * YAML scenario parsing, suite management, and setup execution.
 */

// Types
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
} from './types.js';

// Type guards
export {
  isContainsMatcher,
  isExistsMatcher,
  isComparisonMatcher,
  isRegexMatcher,
  isRefMatcher,
  isChatStep,
  isVerifyStep,
  isWaitStep,
  isInlineSetupStep,
  isInsertStep,
  isProcessStep as isProcessStepType,
} from './types.js';

// Parser
export { parseScenarioFile, parseScenario, parseScenarioFiles, ParseError } from './parser.js';

// Suite management
export {
  loadSuiteConfig,
  loadSuiteScenarios,
  filterScenarios,
  truncateToStep,
  getScenarioSummary,
  getAllTags,
  groupByTag,
  findStepByLabel,
  getStepIndex,
} from './suite.js';

// Setup
export type {
  AliasEntry,
  AliasResolutionContext,
  AliasRegistry,
  SetupExecutor,
  SetupResult,
  RunSetupOptions,
} from './setup.js';

export { createAliasRegistry, runSetupSteps } from './setup.js';
