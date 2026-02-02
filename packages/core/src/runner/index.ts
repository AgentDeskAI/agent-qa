/**
 * Runner Module
 *
 * Test execution for scenarios and suites.
 */

// Types
export type {
  StepStatus,
  StepReportBase,
  ChatStepReport,
  VerifyStepReport,
  WaitStepReport,
  SetupStepReport,
  StepReport,
  ScenarioStatus,
  ScenarioReport,
  SuiteReport,
  RunScenarioOptions,
  RunSuiteOptions,
  RunResult,
  CapturedState,
  // Multi-run types
  MetricStats,
  AggregatedStepReport,
  HallucinationAnalysis,
  AggregatedScenarioReport,
  MultiRunResult,
  MultiRunOptions,
} from './types.js';

// Context
export type { ExecutionContextOptions } from './context.js';

export { ExecutionContext } from './context.js';

// Runner
export type { TestRunnerOptions } from './runner.js';

export { TestRunner, createTestRunner } from './runner.js';

// Multi-run executor
export { executeMultiRun } from './multi-run.js';

// Parallel execution
export {
  executeParallel,
  toSuiteReport,
  filterScenariosForParallel,
  type ParallelLifecycleHooks,
  type ParallelRunOptions,
  type ParallelRunResult,
  type ParallelSuiteOptions,
} from './parallel-runner.js';

// User isolation
export {
  generateScenarioUserId,
  generateLegacyScenarioUserId,
  isAgentQaUserId,
  isAgentQaEmail,
  extractScenarioSlug,
  generateCreateUserSql,
  generateDeleteUserSql,
  createUserIsolationContext,
  createUserIsolationManager,
  UserIsolationManager,
  AGENTQA_USER_PREFIX,
  AGENTQA_USER_PATTERN,
  type GenerateUserIdOptions,
  type UserIsolationContext,
  type UserIsolationManagerOptions,
} from './user-isolation.js';

// Step executors
export {
  executeChatStep,
  executeVerifyStep,
  executeWaitStep,
  executeSetupStep,
} from './steps/index.js';

export type {
  ExecuteChatStepOptions,
  ExecuteVerifyStepOptions,
  ExecuteWaitStepOptions,
  ExecuteSetupStepOptions,
} from './steps/index.js';
