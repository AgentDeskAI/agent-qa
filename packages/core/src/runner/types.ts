/**
 * Runner Types
 *
 * Types for test execution and reporting.
 */

import type { CostResult } from '@agent-qa/cost-registry';

import type { TokenUsage } from '../adapters/types.js';
import type { EntityRow, AssertionResult } from '../assertions/types.js';
import type { LifecycleHooks } from '../config/types.js';
import type { DiagnosticsData } from '../diagnostics/types.js';
import type { SourceLocation } from '../scenario/types.js';

// Re-export CostResult for consumers
export type { CostResult } from '@agent-qa/cost-registry';

// =============================================================================
// Step Reports
// =============================================================================

/**
 * Result status for a step.
 */
export type StepStatus = 'passed' | 'failed' | 'skipped' | 'error';

/**
 * Base step report.
 */
export interface StepReportBase {
  /** Step index in scenario */
  index: number;
  /** Step label (if provided) */
  label?: string;
  /** Step type */
  type: 'chat' | 'verify' | 'wait' | 'setup' | 'verify-vectors';
  /** Status */
  status: StepStatus;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Assertion results */
  assertions: AssertionResult[];
}

/**
 * Chat step report.
 */
export interface ChatStepReport extends StepReportBase {
  type: 'chat';
  /** User message sent */
  message: string;
  /** Agent response text */
  response?: string;
  /** Tool calls made */
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: unknown }>;
  /** Conversation ID */
  conversationId?: string;
  /** Correlation ID for tracing (unique per chat step) */
  correlationId?: string;
  /** Token usage (basic) */
  usage?: TokenUsage;
  /** Detailed usage data (per-agent breakdown, events, totals) */
  detailedUsage?: {
    agentSummaries?: Array<{
      agentId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      callCount: number;
      provider?: string;
      model?: string;
      trackedBreakdown?: {
        input: { total: number; byCategory: Record<string, number> };
        output: { total: number; byCategory: Record<string, number> };
      };
    }>;
    events?: Array<{
      type: 'user-input' | 'assistant-output' | 'tool-call' | 'tool-result' |
            'agent-step' | 'sub-agent-input' | 'sub-agent-output';
      text?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
      agent?: string;
      stepNumber?: number;
      origin?: 'history' | 'current';
      timestamp?: string;
      query?: string;
    }>;
    totals?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      callCount: number;
      cachedInputTokens?: number;
      cacheCreationTokens?: number;
      cacheReadTokens?: number;
      reasoningTokens?: number;
    };
  };
  /** Captured entities */
  captured?: Record<string, EntityRow>;
  /** Cost breakdown for this step */
  cost?: CostResult;
}

/**
 * Verify step report.
 */
export interface VerifyStepReport extends StepReportBase {
  type: 'verify';
  /** Entities verified */
  entitiesVerified: number;
}

/**
 * Wait step report.
 */
export interface WaitStepReport extends StepReportBase {
  type: 'wait';
  /** Number of poll attempts */
  pollAttempts?: number;
  /** Waited for seconds */
  waitedSeconds?: number;
}

/**
 * Setup step report.
 */
export interface SetupStepReport extends StepReportBase {
  type: 'setup';
  /** Entities inserted */
  entitiesInserted: number;
  /** Aliases created */
  aliasesCreated: string[];
}

/**
 * Verify vectors step report.
 */
export interface VerifyVectorsStepReport extends StepReportBase {
  type: 'verify-vectors';
  /** Collections verified */
  collectionsVerified: number;
  /** Records verified */
  recordsVerified: number;
}

/**
 * Union of all step reports.
 */
export type StepReport = ChatStepReport | VerifyStepReport | WaitStepReport | SetupStepReport | VerifyVectorsStepReport;

// =============================================================================
// Scenario Reports
// =============================================================================

/**
 * Result status for a scenario.
 */
export type ScenarioStatus = 'passed' | 'failed' | 'skipped' | 'error';

/**
 * Scenario execution report.
 */
export interface ScenarioReport {
  /** Scenario ID */
  id: string;
  /** Scenario name */
  name?: string;
  /** Status */
  status: ScenarioStatus;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Step reports */
  steps: StepReport[];
  /** Index of failed step (if any) */
  failedStepIndex?: number;
  /** Error message (if error status) */
  error?: string;
  /** Token usage summary */
  usage?: TokenUsage;
  /** Cost breakdown for the scenario */
  cost?: CostResult;
  /** Source location */
  source?: SourceLocation;
  /** Captured entities */
  captured: Record<string, EntityRow>;
  /** Diagnostics collected on failure (legacy) */
  diagnostics?: DiagnosticsData[];
  /** Raw diagnostics output path and files */
  rawDiagnostics?: {
    dirPath: string;
    files: string[];
  };
  /** Correlation ID for tracing (from last agent response) */
  correlationId?: string;
  /** Conversation ID */
  conversationId?: string;
  /** User ID used in this scenario */
  userId?: string;
  /** When the scenario started */
  startedAt?: Date;
}

// =============================================================================
// Suite Reports
// =============================================================================

/**
 * Suite execution report.
 */
export interface SuiteReport {
  /** Suite name */
  name?: string;
  /** Total scenarios */
  total: number;
  /** Passed scenarios */
  passed: number;
  /** Failed scenarios */
  failed: number;
  /** Skipped scenarios */
  skipped: number;
  /** Error scenarios */
  errors: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Scenario reports */
  scenarios: ScenarioReport[];
  /** Token usage summary */
  usage?: TokenUsage;
  /** Cost breakdown for the suite */
  cost?: CostResult;
  /** Start time */
  startedAt: Date;
  /** End time */
  endedAt: Date;
}

// =============================================================================
// Execution Options
// =============================================================================

/**
 * Options for running a scenario.
 */
export interface RunScenarioOptions {
  /** User ID to use */
  userId?: string;
  /** Verbose output */
  verbose?: boolean;
  /** Stop on first failure */
  stopOnFailure?: boolean;
  /** Target step label (run up to and including this step) */
  targetStep?: string;
  /** Custom timeout in milliseconds */
  timeout?: number;
  /** Lifecycle hooks */
  hooks?: LifecycleHooks;
  /** Save diagnostics even on success (for token analysis) */
  saveDiagnostics?: boolean;
}

/**
 * Options for running a suite.
 */
export interface RunSuiteOptions extends RunScenarioOptions {
  /** Filter by scenario ID */
  id?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by grep pattern */
  grep?: string;
  /** Parallel execution count (default: 1) */
  parallel?: number;
}

// =============================================================================
// Run Result
// =============================================================================

/**
 * Result of running a test suite.
 */
export interface RunResult {
  /** Whether all scenarios passed */
  success: boolean;
  /** Suite report */
  report: SuiteReport;
}

// =============================================================================
// Captured State
// =============================================================================

/**
 * State captured during scenario execution.
 */
export interface CapturedState {
  /** Captured entities by alias */
  entities: Record<string, EntityRow>;
  /** Current conversation ID */
  conversationId?: string;
  /** User ID */
  userId: string;
}

// =============================================================================
// Multi-Run Aggregated Reports
// =============================================================================

/**
 * Statistics for a numeric metric across multiple runs.
 */
export interface MetricStats {
  /** Number of data points */
  count: number;
  /** Mean value */
  mean: number;
  /** Median value */
  median: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Standard deviation */
  stdDev: number;
  /** All raw values */
  values: number[];
}

/**
 * Aggregated step report across multiple runs.
 */
export interface AggregatedStepReport {
  /** Step index */
  index: number;
  /** Step label (if provided) */
  label?: string;
  /** Step type */
  type: 'chat' | 'verify' | 'wait' | 'setup' | 'verify-vectors';
  /** Number of times this step passed */
  passCount: number;
  /** Number of times this step failed */
  failCount: number;
  /** Pass rate as percentage (0-100) */
  passRate: number;
  /** Whether this step is flaky (passes sometimes, fails sometimes) */
  isFlaky: boolean;
  /** Duration statistics */
  durationStats: MetricStats;
  /** Error messages (unique) with occurrence counts */
  errors: Array<{ message: string; count: number }>;
  /** Individual run reports for this step */
  runReports: StepReport[];
}

/**
 * Hallucination detection result for a step.
 */
export interface HallucinationAnalysis {
  /** Step index where hallucination was detected */
  stepIndex: number;
  /** Step label */
  stepLabel?: string;
  /** Number of runs with suspected hallucination */
  occurrenceCount: number;
  /** Total runs */
  totalRuns: number;
  /** Occurrence rate as percentage (0-100) */
  rate: number;
  /** Details of each hallucination occurrence */
  occurrences: Array<{
    runIndex: number;
    /** Response text that mentioned action */
    responseText: string;
    /** Tool assertions that failed */
    failedToolAssertions: string[];
    /** Expected tool calls that didn't happen */
    missingToolCalls: string[];
  }>;
}

/**
 * Aggregated scenario report across multiple runs.
 */
export interface AggregatedScenarioReport {
  /** Scenario ID */
  id: string;
  /** Scenario name */
  name?: string;
  /** Total number of runs */
  totalRuns: number;
  /** Number of successful runs */
  passedRuns: number;
  /** Number of failed runs */
  failedRuns: number;
  /** Number of error runs */
  errorRuns: number;
  /** Pass rate as percentage (0-100) */
  passRate: number;
  /** Whether this scenario is flaky */
  isFlaky: boolean;
  /** Aggregated step reports */
  steps: AggregatedStepReport[];
  /** Token usage statistics */
  usageStats?: {
    inputTokens: MetricStats;
    outputTokens: MetricStats;
    totalTokens: MetricStats;
    cacheReadTokens?: MetricStats;
    cacheCreationTokens?: MetricStats;
  };
  /** Cost statistics across runs */
  costStats?: {
    inputCost: MetricStats;
    outputCost: MetricStats;
    cacheWriteCost: MetricStats;
    cacheReadCost: MetricStats;
    totalCost: MetricStats;
  };
  /** Duration statistics */
  durationStats: MetricStats;
  /** Hallucination analysis */
  hallucinations: HallucinationAnalysis[];
  /** Individual run reports */
  runReports: ScenarioReport[];
}

/**
 * Result of a multi-run execution.
 */
export interface MultiRunResult {
  /** Whether all runs passed */
  success: boolean;
  /** Aggregated report */
  aggregatedReport: AggregatedScenarioReport;
  /** Timestamp when multi-run started */
  startedAt: Date;
  /** Timestamp when multi-run ended */
  endedAt: Date;
  /** Total duration in milliseconds */
  totalDurationMs: number;
}

/**
 * Options for multi-run execution.
 */
export interface MultiRunOptions extends RunScenarioOptions {
  /** Number of runs to execute */
  runs: number;
  /** Continue running even if some runs fail */
  continueOnFailure?: boolean;
  /** Action words to detect in responses for hallucination analysis */
  hallucinationKeywords?: string[];
}
