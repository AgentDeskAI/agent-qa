/**
 * Test Runner
 *
 * Main test runner for executing scenarios and suites.
 */

import type { CostResult } from '@agent-qa/cost-registry';

import type { AgentAdapter, DatabaseAdapter, VectorStoreAdapter, TokenUsage } from '../adapters/types.js';
import type { ChatStepReport } from './types.js';
import type { ResolvedConfig, DiagnosticsConfig as ConfigDiagnosticsConfig, DiagnosticsProviderConfig, RelationshipPattern } from '../config/types.js';
import { writeRawDiagnostics, writeSuccessDiagnostics, appendTempoTraces, readFailureMetadata, readSuccessMetadata, type HttpResponseData, type FailureMetadata, type SuccessMetadata } from '../diagnostics/raw-writer.js';
import { collectTracesForCorrelationIds } from '../diagnostics/traces-provider.js';
import { clearTmuxBuffer, captureTmuxLogs } from '../diagnostics/tmux-logs.js';
import type { TracesProvider } from '../traces/index.js';
import type { DiagnosticsConfig, DiagnosticsProvider } from '../diagnostics/types.js';
import { runSetupSteps, createAliasRegistry } from '../scenario/setup.js';
import type { SetupExecutor } from '../scenario/setup.js';
import { loadSuiteConfig, loadSuiteScenarios, filterScenarios, truncateToStep } from '../scenario/suite.js';
import {
  isChatStep,
  isVerifyStep,
  isWaitStep,
  isInlineSetupStep,
  isVerifyVectorsStep,
} from '../scenario/types.js';
import type { Scenario, Step } from '../scenario/types.js';

import { ExecutionContext } from './context.js';
import {
  executeChatStep,
  executeVerifyStep,
  executeWaitStep,
  executeSetupStep,
  executeVerifyVectorsStep,
} from './steps/index.js';
import type {
  RunSuiteOptions,
  RunScenarioOptions,
  RunResult,
  SuiteReport,
  ScenarioReport,
  StepReport,
} from './types.js';

/**
 * Options for creating a test runner.
 */
export interface TestRunnerOptions {
  /** Agent adapter */
  agent: AgentAdapter;
  /** Database adapter */
  database: DatabaseAdapter;
  /** Vector store adapter (optional - for verifyVectors steps) */
  vectorStore?: VectorStoreAdapter;
  /** Setup executor (optional - defaults to database adapter) */
  setup?: SetupExecutor;
  /** Default user ID */
  defaultUserId: string;
  /** Verbose logging */
  verbose?: boolean;
  /** Diagnostics configuration (from config/types.ts, converted to diagnostics/types.ts internally) */
  diagnostics?: ConfigDiagnosticsConfig;
  /** Relationship patterns for semantic FK assertions */
  relationshipPatterns?: RelationshipPattern[];
}

/**
 * Test runner for executing scenarios.
 */
export class TestRunner {
  private readonly agent: AgentAdapter;
  private readonly database: DatabaseAdapter;
  private readonly vectorStore?: VectorStoreAdapter;
  private readonly setup: SetupExecutor;
  private readonly defaultUserId: string;
  private readonly verbose: boolean;
  private readonly diagnosticsConfig?: DiagnosticsConfig;
  private readonly tracesProvider?: TracesProvider;
  private readonly relationshipPatterns: RelationshipPattern[];

  constructor(options: TestRunnerOptions) {
    this.agent = options.agent;
    this.database = options.database;
    this.vectorStore = options.vectorStore;
    this.setup = options.setup ?? createDefaultSetupExecutor(options.database);
    this.defaultUserId = options.defaultUserId;
    this.verbose = options.verbose ?? false;
    this.diagnosticsConfig = convertDiagnosticsConfig(options.diagnostics);
    this.tracesProvider = extractTracesProvider(options.diagnostics);
    this.relationshipPatterns = options.relationshipPatterns ?? [];
  }

  /**
   * Get tmux config from diagnostics config (handles both object and array formats).
   */
  private getTmuxConfig(): DiagnosticsConfig['tmux'] | undefined {
    if (!this.diagnosticsConfig || Array.isArray(this.diagnosticsConfig)) {
      return undefined;
    }
    return this.diagnosticsConfig.tmux;
  }

  /**
   * Run a test suite from a file path.
   */
  async runSuite(suitePath: string, options: RunSuiteOptions = {}): Promise<RunResult> {
    const startedAt = new Date();

    // Load suite config
    const config = loadSuiteConfig(suitePath);

    // Load scenarios
    let scenarios = loadSuiteScenarios(config);

    // Apply filters
    scenarios = filterScenarios(scenarios, {
      id: options.id,
      tags: options.tags,
      grep: options.grep,
    });

    if (this.verbose || options.verbose) {
      console.log(`Running ${scenarios.length} scenario(s) from ${config.name ?? suitePath}`);
    }

    // Run scenarios
    const scenarioReports: ScenarioReport[] = [];
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const totalCost: CostResult = {
      inputCost: 0,
      outputCost: 0,
      cachedInputCost: 0,
      cacheWriteCost: 0,
      cacheReadCost: 0,
      totalCost: 0,
      currency: 'USD',
    };

    for (const scenario of scenarios) {
      const report = await this.runScenario(scenario, options);
      scenarioReports.push(report);

      // Aggregate usage
      if (report.usage) {
        totalUsage.inputTokens += report.usage.inputTokens;
        totalUsage.outputTokens += report.usage.outputTokens;
        totalUsage.totalTokens += report.usage.totalTokens;
      }

      // Aggregate cost
      if (report.cost) {
        totalCost.inputCost += report.cost.inputCost;
        totalCost.outputCost += report.cost.outputCost;
        totalCost.cacheWriteCost += report.cost.cacheWriteCost;
        totalCost.cacheReadCost += report.cost.cacheReadCost;
        totalCost.totalCost += report.cost.totalCost;
      }

      // Stop on failure if requested
      if (options.stopOnFailure && report.status !== 'passed') {
        break;
      }
    }

    // Collect deferred diagnostics (traces) for all scenarios with diagnostics
    // This batches all slow trace queries into a single ~30s wait
    // Includes both failures and successes (when --save-diagnostics is used)
    const reportsWithDiagnostics = scenarioReports.filter(
      (r) => r.rawDiagnostics
    );

    if (reportsWithDiagnostics.length > 0 && this.tracesProvider) {
      if (this.verbose || options.verbose) {
        console.log(`\nCollecting traces for ${reportsWithDiagnostics.length} scenario(s)...`);
      }

      try {
        // For each scenario with raw diagnostics, collect traces for all correlationIds
        for (const report of reportsWithDiagnostics) {
          if (!report.rawDiagnostics) continue;

          // Read correlationIds from failure.json or success.json
          let correlationIds: string[] = [];
          const failure = readFailureMetadata(report.rawDiagnostics.dirPath);
          if (failure?.context?.correlationIds) {
            correlationIds = failure.context.correlationIds;
          } else {
            const success = readSuccessMetadata(report.rawDiagnostics.dirPath);
            if (success?.context?.correlationIds) {
              correlationIds = success.context.correlationIds;
            }
          }

          if (correlationIds.length === 0) {
            if (this.verbose || options.verbose) {
              console.log(`  ${report.id}: No correlationIds to fetch`);
            }
            continue;
          }

          // Collect all traces for this scenario using the configured provider
          const traces = await collectTracesForCorrelationIds(this.tracesProvider, correlationIds);

          if (traces.length > 0) {
            // Append traces to the existing raw diagnostics directory
            const newFiles = appendTempoTraces(report.rawDiagnostics.dirPath, traces);
            report.rawDiagnostics.files.push(...newFiles);

            if (this.verbose || options.verbose) {
              console.log(`  ${report.id}: Collected ${traces.length} traces`);
            }
          }
        }
      } catch (error) {
        if (this.verbose || options.verbose) {
          console.log(`Warning: Failed to collect deferred diagnostics: ${error}`);
        }
      }
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();

    // Build report
    const passed = scenarioReports.filter((r) => r.status === 'passed').length;
    const failed = scenarioReports.filter((r) => r.status === 'failed').length;
    const skipped = scenarioReports.filter((r) => r.status === 'skipped').length;
    const errors = scenarioReports.filter((r) => r.status === 'error').length;

    const report: SuiteReport = {
      name: config.name,
      total: scenarioReports.length,
      passed,
      failed,
      skipped,
      errors,
      durationMs,
      scenarios: scenarioReports,
      usage: totalUsage.totalTokens > 0 ? totalUsage : undefined,
      cost: totalCost.totalCost > 0 ? totalCost : undefined,
      startedAt,
      endedAt,
    };

    return {
      success: failed === 0 && errors === 0,
      report,
    };
  }

  /**
   * Run a single scenario.
   */
  async runScenario(scenario: Scenario, options: RunScenarioOptions = {}): Promise<ScenarioReport> {
    const startTime = Date.now();
    const scenarioStartTime = new Date();
    const userId = options.userId ?? scenario.userId ?? this.defaultUserId;
    const verbose = this.verbose || options.verbose;

    if (verbose) {
      console.log(`\nScenario: ${scenario.name ?? scenario.id}`);
    }

    // Clear tmux buffer before scenario if configured
    const tmuxConfig = this.getTmuxConfig();
    if (tmuxConfig?.clearBeforeScenario) {
      clearTmuxBuffer(tmuxConfig.sessionName);
      if (verbose) {
        console.log('  Cleared tmux buffer');
      }
    }

    // Run beforeEach hook
    if (options.hooks?.beforeEach) {
      try {
        await options.hooks.beforeEach({
          id: scenario.id,
          name: scenario.name ?? scenario.id,
          tags: scenario.tags,
        });
      } catch (error) {
        return {
          id: scenario.id,
          name: scenario.name,
          status: 'error',
          durationMs: Date.now() - startTime,
          steps: [],
          error: `beforeEach hook failed: ${error instanceof Error ? error.message : String(error)}`,
          source: scenario.source,
          captured: {},
        };
      }
    }

    // Create alias registry and run setup steps
    let aliases = createAliasRegistry();
    if (scenario.setup && scenario.setup.length > 0) {
      if (verbose) {
        console.log('  Running setup...');
      }

      const setupResult = await runSetupSteps({
        executor: this.setup,
        steps: scenario.setup,
        userId,
        verbose,
      });

      if (!setupResult.success) {
        return {
          id: scenario.id,
          name: scenario.name,
          status: 'error',
          durationMs: Date.now() - startTime,
          steps: [],
          error: `Setup failed: ${setupResult.error}`,
          source: scenario.source,
          captured: {},
        };
      }

      aliases = setupResult.aliases;
    }

    // Create execution context
    const context = new ExecutionContext({
      userId,
      agent: this.agent,
      database: this.database,
      aliases,
      verbose,
      relationshipPatterns: this.relationshipPatterns,
    });

    // Determine which steps to run
    let steps = scenario.steps;
    if (options.targetStep) {
      const targetScenario = truncateToStep(scenario, options.targetStep);
      steps = targetScenario.steps;
    }

    // Execute steps
    const stepReports: StepReport[] = [];
    let failedStepIndex: number | undefined;
    let failedStepStartTime: Date | undefined;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepStartTime = new Date();
      const report = await this.executeStep(step, context, i, options);

      stepReports.push(report);

      if (report.status === 'failed' || report.status === 'error') {
        failedStepIndex = i;
        failedStepStartTime = stepStartTime;

        if (options.stopOnFailure !== false) {
          // Default is to stop on failure
          break;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Determine overall status
    let status: ScenarioReport['status'] = 'passed';
    if (stepReports.some((r) => r.status === 'error')) {
      status = 'error';
    } else if (stepReports.some((r) => r.status === 'failed')) {
      status = 'failed';
    } else if (stepReports.every((r) => r.status === 'skipped')) {
      status = 'skipped';
    }

    // Collect raw diagnostics on failure OR when saveDiagnostics is enabled
    // Raw approach: write separate files for each diagnostic source
    let diagnostics;
    let rawDiagnosticsResult: { dirPath: string; files: string[] } | undefined;

    const shouldSaveDiagnostics = failedStepIndex !== undefined || options.saveDiagnostics;

    if (shouldSaveDiagnostics) {
      try {
        const outputDir = this.diagnosticsConfig?.outputDir;

        if (outputDir) {
          const completionTime = new Date();

          // Build HTTP responses from ALL chat steps
          const chatReports = stepReports.filter(
            (r): r is typeof r & { type: 'chat' } => r.type === 'chat'
          );

          const httpResponses: HttpResponseData[] = chatReports.map((r) => ({
            stepIndex: r.index,
            stepLabel: r.label,
            message: r.message,
            response: r.response,
            toolCalls: r.toolCalls,
            conversationId: r.conversationId,
            correlationId: r.correlationId,
            usage: r.usage,
            detailedUsage: r.detailedUsage,
            durationMs: r.durationMs,
          }));

          // Collect correlationIds from all chat steps
          const correlationIds = chatReports
            .map((r) => r.correlationId)
            .filter((id): id is string => id !== undefined);

          if (failedStepIndex !== undefined) {
            // Write failure diagnostics
            const failedStep = steps[failedStepIndex];
            const failureMetadata: FailureMetadata = {
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              failedStep: {
                index: failedStepIndex,
                label: 'label' in failedStep ? (failedStep.label as string) : undefined,
                type: this.getStepType(failedStep),
              },
              error: stepReports[failedStepIndex].error ?? 'Unknown error',
              timing: {
                scenarioStartTime: scenarioStartTime.toISOString(),
                failureTime: completionTime.toISOString(),
                totalDurationMs: durationMs,
              },
              context: {
                userId,
                conversationId: context.conversationId,
                correlationIds,
              },
            };

            // Capture tmux logs for the scenario (increased line count for scenario-level)
            const tmuxConfig = this.getTmuxConfig();
            const tmuxLogs = tmuxConfig?.sessionName
              ? captureTmuxLogs(tmuxConfig.sessionName, 1000)
              : undefined;

            // Write raw diagnostics
            rawDiagnosticsResult = await writeRawDiagnostics(outputDir, scenario.id, {
              httpResponses,
              tmuxLogs,
              failure: failureMetadata,
              // Note: Tempo traces are collected at suite end (deferred)
            });
          } else {
            // Write success diagnostics (for token analysis)
            const usage = context.getUsage();
            const successMetadata: SuccessMetadata = {
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              stepsCompleted: stepReports.length,
              timing: {
                scenarioStartTime: scenarioStartTime.toISOString(),
                completedTime: completionTime.toISOString(),
                totalDurationMs: durationMs,
              },
              context: {
                userId,
                conversationId: context.conversationId,
                correlationIds,
              },
              usage: usage ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
              } : undefined,
            };

            // Capture tmux logs for success diagnostics
            const tmuxConfig = this.getTmuxConfig();
            const tmuxLogs = tmuxConfig?.sessionName
              ? captureTmuxLogs(tmuxConfig.sessionName, 1000)
              : undefined;

            rawDiagnosticsResult = await writeSuccessDiagnostics(outputDir, scenario.id, {
              httpResponses,
              success: successMetadata,
              tmuxLogs,
            });
          }

          if (verbose) {
            console.log(`  Diagnostics saved to: ${rawDiagnosticsResult.dirPath}`);
            for (const file of rawDiagnosticsResult.files) {
              console.log(`    → ${file}`);
            }
          }
        }
      } catch (error) {
        if (verbose) {
          console.log(`  Warning: Failed to collect diagnostics: ${error}`);
        }
      }
    }

    if (verbose) {
      console.log(`  Result: ${status.toUpperCase()} (${durationMs}ms)`);
      // Show error message if present
      if (failedStepIndex !== undefined && stepReports[failedStepIndex].error) {
        console.log(`  Error: ${stepReports[failedStepIndex].error}`);
      }
    }

    // Aggregate costs from chat steps
    const scenarioCost = aggregateStepCosts(stepReports);

    const report: ScenarioReport = {
      id: scenario.id,
      name: scenario.name,
      status,
      durationMs,
      steps: stepReports,
      failedStepIndex,
      error: failedStepIndex !== undefined ? stepReports[failedStepIndex].error : undefined,
      usage: context.getUsage(),
      cost: scenarioCost,
      source: scenario.source,
      captured: context.getAllCaptured(),
      diagnostics,
      rawDiagnostics: rawDiagnosticsResult,
      // Tracing info for deferred diagnostics collection
      correlationId: context.correlationId,
      conversationId: context.conversationId,
      userId,
      startedAt: scenarioStartTime,
    };

    // Run afterEach hook
    if (options.hooks?.afterEach) {
      try {
        await options.hooks.afterEach(
          { id: scenario.id, name: scenario.name ?? scenario.id, tags: scenario.tags },
          { passed: status === 'passed', error: report.error, duration: durationMs }
        );
      } catch (error) {
        if (verbose) {
          console.log(`  Warning: afterEach hook failed: ${error}`);
        }
      }
    }

    return report;
  }

  /**
   * Get the step type for a step.
   */
  private getStepType(step: Step): 'chat' | 'verify' | 'wait' | 'setup' | 'verify-vectors' {
    if (isChatStep(step)) return 'chat';
    if (isVerifyStep(step)) return 'verify';
    if (isWaitStep(step)) return 'wait';
    if (isInlineSetupStep(step)) return 'setup';
    if (isVerifyVectorsStep(step)) return 'verify-vectors';
    return 'chat'; // fallback
  }

  /**
   * Execute a single step.
   */
  private async executeStep(
    step: Step,
    context: ExecutionContext,
    index: number,
    options: RunScenarioOptions
  ): Promise<StepReport> {
    if (isChatStep(step)) {
      return executeChatStep({
        step,
        context,
        index,
        timeout: options.timeout,
      });
    }

    if (isVerifyStep(step)) {
      return executeVerifyStep({
        step,
        context,
        index,
      });
    }

    if (isWaitStep(step)) {
      return executeWaitStep({
        step,
        context,
        index,
      });
    }

    if (isInlineSetupStep(step)) {
      return executeSetupStep({
        step,
        context,
        index,
      });
    }

    if (isVerifyVectorsStep(step)) {
      if (!this.vectorStore) {
        return {
          index,
          type: 'verify-vectors',
          status: 'error',
          durationMs: 0,
          error: 'Vector store not configured. Add vectorStore adapter to config.',
          assertions: [],
          collectionsVerified: 0,
          recordsVerified: 0,
        };
      }
      return executeVerifyVectorsStep({
        step,
        context,
        vectorStore: this.vectorStore,
        index,
      });
    }

    // Unknown step type
    return {
      index,
      type: 'chat',
      status: 'error',
      durationMs: 0,
      error: 'Unknown step type',
      assertions: [],
      message: '',
    };
  }
}

/**
 * Create a test runner from resolved config.
 */
export function createTestRunner(
  config: ResolvedConfig,
  adapters: {
    agent: AgentAdapter;
    database: DatabaseAdapter;
    vectorStore?: VectorStoreAdapter;
    setup?: SetupExecutor;
    diagnostics?: ConfigDiagnosticsConfig;
  }
): TestRunner {
  return new TestRunner({
    agent: adapters.agent,
    database: adapters.database,
    vectorStore: adapters.vectorStore,
    setup: adapters.setup,
    defaultUserId: config.defaultUserId,
    verbose: config.verbose,
    diagnostics: adapters.diagnostics ?? config.diagnostics,
    relationshipPatterns: config.relationships,
  });
}

/**
 * Create a default setup executor from a database adapter.
 *
 * Delegates entity insertion to the database adapter's generic insert method.
 */
function createDefaultSetupExecutor(database: DatabaseAdapter): SetupExecutor {
  return {
    async insert(entity: string, data: Record<string, unknown>): Promise<{ id: string }> {
      return database.insert(entity, data);
    },
  };
}

/**
 * Convert config DiagnosticsConfig to diagnostics DiagnosticsConfig.
 *
 * Handles both formats:
 * - Array format: DiagnosticsProviderConfig[] → converted to { custom: DiagnosticsProvider[] }
 * - Object format: DiagnosticsConfigObject → mapped to DiagnosticsConfig
 */
function convertDiagnosticsConfig(config: ConfigDiagnosticsConfig | undefined): DiagnosticsConfig | undefined {
  if (!config) {
    return undefined;
  }

  // Handle array format (custom providers only)
  if (Array.isArray(config)) {
    // Convert DiagnosticsProviderConfig[] to DiagnosticsProvider[]
    // The config format uses a generic 'context: unknown' while diagnostics uses FailureContext
    const providers: DiagnosticsProvider[] = config.map((p: DiagnosticsProviderConfig) => ({
      name: p.name,
      async collect(context) {
        const result = await p.collect(context);
        if (!result) return null;
        return {
          type: result.type as 'logs' | 'trace' | 'custom',
          title: result.title,
          content: result.content,
          raw: result.raw,
        };
      },
      cleanup: p.cleanup,
    }));
    return { custom: providers };
  }

  // Handle object format - map the nested configs
  const result: DiagnosticsConfig = {};

  if (config.tmux) {
    result.tmux = {
      sessionName: config.tmux.sessionName,
      lines: config.tmux.lines,
      filterByTime: config.tmux.filterByTime,
      clearBeforeScenario: config.tmux.clearBeforeScenario,
    };
  }

  if (config.custom) {
    // Convert DiagnosticsProviderConfig[] to DiagnosticsProvider[]
    result.custom = config.custom.map((p: DiagnosticsProviderConfig) => ({
      name: p.name,
      async collect(context) {
        const configResult = await p.collect(context);
        if (!configResult) return null;
        return {
          type: configResult.type as 'logs' | 'trace' | 'custom',
          title: configResult.title,
          content: configResult.content,
          raw: configResult.raw,
        };
      },
      cleanup: p.cleanup,
    }));
  }

  // Include additional config options
  if (config.maxDiagnosticLines !== undefined) {
    result.maxDiagnosticLines = config.maxDiagnosticLines;
  }

  if (config.outputDir !== undefined) {
    result.outputDir = config.outputDir;
  }

  return result;
}

/**
 * Extract the TracesProvider from the config, if present.
 */
function extractTracesProvider(config: ConfigDiagnosticsConfig | undefined): TracesProvider | undefined {
  if (!config || Array.isArray(config)) {
    return undefined;
  }

  // The traces.provider is typed as unknown in config to avoid circular imports,
  // but it should be a TracesProvider at runtime
  return config.traces?.provider as TracesProvider | undefined;
}

/**
 * Aggregate costs from all chat steps in a scenario.
 */
function aggregateStepCosts(stepReports: StepReport[]): CostResult | undefined {
  const chatSteps = stepReports.filter(
    (s): s is ChatStepReport => s.type === 'chat' && 'cost' in s && s.cost !== undefined
  );

  if (chatSteps.length === 0) {
    return undefined;
  }

  const totalCost: CostResult = {
    inputCost: 0,
    outputCost: 0,
    cachedInputCost: 0,
    cacheWriteCost: 0,
    cacheReadCost: 0,
    totalCost: 0,
    currency: 'USD',
  };

  for (const step of chatSteps) {
    if (step.cost) {
      totalCost.inputCost += step.cost.inputCost;
      totalCost.outputCost += step.cost.outputCost;
      totalCost.cacheWriteCost += step.cost.cacheWriteCost;
      totalCost.cacheReadCost += step.cost.cacheReadCost;
      totalCost.totalCost += step.cost.totalCost;
    }
  }

  return totalCost.totalCost > 0 ? totalCost : undefined;
}
