/**
 * Multi-Run Executor
 *
 * Executes a scenario multiple times and aggregates results for
 * hallucination detection and flakiness analysis.
 */

import type { Scenario } from '../scenario/types.js';

import type { TestRunner } from './runner.js';
import type {
  ScenarioReport,
  StepReport,
  ChatStepReport,
  MultiRunOptions,
  MultiRunResult,
  AggregatedScenarioReport,
  AggregatedStepReport,
  HallucinationAnalysis,
  MetricStats,
} from './types.js';

/**
 * Default keywords that suggest an action was taken.
 * Used for hallucination detection.
 */
const DEFAULT_HALLUCINATION_KEYWORDS = [
  'deleted',
  'removed',
  'created',
  'added',
  'updated',
  'modified',
  'completed',
  'marked',
  'set',
  'changed',
  'moved',
  'scheduled',
  'done',
];

/**
 * Execute a scenario multiple times and aggregate results.
 */
export async function executeMultiRun(
  runner: TestRunner,
  scenario: Scenario,
  options: MultiRunOptions
): Promise<MultiRunResult> {
  const startedAt = new Date();
  const runReports: ScenarioReport[] = [];
  const { runs, continueOnFailure = true, hooks } = options;

  console.log(`\nRunning scenario ${runs} times: ${scenario.name ?? scenario.id}`);
  console.log('─'.repeat(60));

  for (let i = 0; i < runs; i++) {
    console.log(`\n[Run ${i + 1}/${runs}]`);

    // Execute beforeEach hook to reset database state
    // Note: The runner.runScenario already calls beforeEach, but we ensure
    // database is clean by calling it here as well for multi-run safety
    if (hooks?.beforeEach) {
      await hooks.beforeEach({
        id: scenario.id,
        name: scenario.name ?? scenario.id,
        tags: scenario.tags,
      });
    }

    // Run the scenario
    const report = await runner.runScenario(scenario, {
      ...options,
      // Each run stops on its own failure
      stopOnFailure: true,
    });

    runReports.push(report);

    // Report run status
    const statusSymbol = report.status === 'passed' ? '✓' : '✗';
    const tokenInfo = report.usage
      ? ` (${report.usage.totalTokens.toLocaleString()} tokens)`
      : '';
    const costInfo = report.cost && report.cost.totalCost > 0
      ? ` ($${report.cost.totalCost.toFixed(4)})`
      : '';
    console.log(
      `  ${statusSymbol} Run ${i + 1}: ${report.status.toUpperCase()} (${report.durationMs}ms)${tokenInfo}${costInfo}`
    );

    // Stop if requested and this run failed
    if (!continueOnFailure && report.status !== 'passed') {
      console.log('  Stopping early due to failure (use --continue-on-failure to continue)');
      break;
    }
  }

  const endedAt = new Date();

  // Aggregate results
  const aggregatedReport = aggregateResults(scenario, runReports, options);

  return {
    success: aggregatedReport.passRate === 100,
    aggregatedReport,
    startedAt,
    endedAt,
    totalDurationMs: endedAt.getTime() - startedAt.getTime(),
  };
}

/**
 * Aggregate results from multiple runs.
 */
function aggregateResults(
  scenario: Scenario,
  runReports: ScenarioReport[],
  options: MultiRunOptions
): AggregatedScenarioReport {
  const totalRuns = runReports.length;
  const passedRuns = runReports.filter((r) => r.status === 'passed').length;
  const failedRuns = runReports.filter((r) => r.status === 'failed').length;
  const errorRuns = runReports.filter((r) => r.status === 'error').length;
  const passRate = totalRuns > 0 ? (passedRuns / totalRuns) * 100 : 0;

  // Aggregate steps
  const steps = aggregateSteps(runReports);

  // Aggregate token usage
  const usageStats = aggregateUsage(runReports);

  // Aggregate cost
  const costStats = aggregateCost(runReports);

  // Calculate duration stats
  const durationStats = calculateStats(runReports.map((r) => r.durationMs));

  // Detect hallucinations
  const hallucinations = detectHallucinations(runReports, options);

  return {
    id: scenario.id,
    name: scenario.name,
    totalRuns,
    passedRuns,
    failedRuns,
    errorRuns,
    passRate,
    isFlaky: passedRuns > 0 && failedRuns > 0,
    steps,
    usageStats,
    costStats,
    durationStats,
    hallucinations,
    runReports,
  };
}

/**
 * Aggregate step reports across runs.
 */
function aggregateSteps(runReports: ScenarioReport[]): AggregatedStepReport[] {
  if (runReports.length === 0) return [];

  // Find max step count across all runs
  const maxSteps = Math.max(...runReports.map((r) => r.steps.length));
  const aggregatedSteps: AggregatedStepReport[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const stepReports = runReports
      .map((r) => r.steps[i])
      .filter((s): s is StepReport => s !== undefined);

    if (stepReports.length === 0) continue;

    const passCount = stepReports.filter((s) => s.status === 'passed').length;
    const failCount = stepReports.filter((s) => s.status !== 'passed').length;

    // Collect unique errors with counts
    const errorCounts = new Map<string, number>();
    for (const step of stepReports) {
      if (step.error) {
        errorCounts.set(step.error, (errorCounts.get(step.error) ?? 0) + 1);
      }
    }
    const errors = Array.from(errorCounts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count);

    aggregatedSteps.push({
      index: i,
      label: stepReports[0].label,
      type: stepReports[0].type,
      passCount,
      failCount,
      passRate: (passCount / stepReports.length) * 100,
      isFlaky: passCount > 0 && failCount > 0,
      durationStats: calculateStats(stepReports.map((s) => s.durationMs)),
      errors,
      runReports: stepReports,
    });
  }

  return aggregatedSteps;
}

/**
 * Aggregate token usage across runs.
 */
function aggregateUsage(
  runReports: ScenarioReport[]
): AggregatedScenarioReport['usageStats'] {
  const reportsWithUsage = runReports.filter((r) => r.usage);
  if (reportsWithUsage.length === 0) return undefined;

  return {
    inputTokens: calculateStats(reportsWithUsage.map((r) => r.usage!.inputTokens)),
    outputTokens: calculateStats(reportsWithUsage.map((r) => r.usage!.outputTokens)),
    totalTokens: calculateStats(reportsWithUsage.map((r) => r.usage!.totalTokens)),
  };
}

/**
 * Aggregate cost across runs.
 */
function aggregateCost(
  runReports: ScenarioReport[]
): AggregatedScenarioReport['costStats'] {
  const reportsWithCost = runReports.filter((r) => r.cost && r.cost.totalCost > 0);
  if (reportsWithCost.length === 0) return undefined;

  return {
    inputCost: calculateStats(reportsWithCost.map((r) => r.cost!.inputCost)),
    outputCost: calculateStats(reportsWithCost.map((r) => r.cost!.outputCost)),
    cacheWriteCost: calculateStats(reportsWithCost.map((r) => r.cost!.cacheWriteCost)),
    cacheReadCost: calculateStats(reportsWithCost.map((r) => r.cost!.cacheReadCost)),
    totalCost: calculateStats(reportsWithCost.map((r) => r.cost!.totalCost)),
  };
}

/**
 * Detect hallucinations by analyzing tool assertion failures.
 *
 * A hallucination is detected when:
 * 1. Response text contains action keywords (e.g., "deleted", "created")
 * 2. A tool assertion failed (expected tool call didn't happen)
 */
function detectHallucinations(
  runReports: ScenarioReport[],
  options: MultiRunOptions
): HallucinationAnalysis[] {
  const keywords = options.hallucinationKeywords ?? DEFAULT_HALLUCINATION_KEYWORDS;
  const hallucinationsByStep = new Map<number, HallucinationAnalysis>();

  for (let runIndex = 0; runIndex < runReports.length; runIndex++) {
    const report = runReports[runIndex];

    for (const step of report.steps) {
      // Only check chat steps
      if (step.type !== 'chat') continue;

      const chatStep = step as ChatStepReport;
      const response = chatStep.response ?? '';

      // Check if response mentions action words
      const mentionsAction = keywords.some((kw) =>
        response.toLowerCase().includes(kw.toLowerCase())
      );

      if (!mentionsAction) continue;

      // Check for tool assertion failures
      // These typically look like: "toolName: expected X call(s), got 0"
      const toolAssertionFailures = step.assertions
        .filter((a) => !a.passed && a.message.includes('expected') && a.message.includes('call'))
        .map((a) => a.message);

      if (toolAssertionFailures.length === 0) continue;

      // This is a suspected hallucination
      const existing = hallucinationsByStep.get(step.index);
      if (existing) {
        existing.occurrenceCount++;
        existing.occurrences.push({
          runIndex,
          responseText: response.slice(0, 200),
          failedToolAssertions: toolAssertionFailures,
          missingToolCalls: extractMissingTools(toolAssertionFailures),
        });
      } else {
        hallucinationsByStep.set(step.index, {
          stepIndex: step.index,
          stepLabel: step.label,
          occurrenceCount: 1,
          totalRuns: runReports.length,
          rate: 0, // Calculated below
          occurrences: [
            {
              runIndex,
              responseText: response.slice(0, 200),
              failedToolAssertions: toolAssertionFailures,
              missingToolCalls: extractMissingTools(toolAssertionFailures),
            },
          ],
        });
      }
    }
  }

  // Calculate rates
  const results = Array.from(hallucinationsByStep.values());
  for (const h of results) {
    h.rate = (h.occurrenceCount / h.totalRuns) * 100;
  }

  return results.sort((a, b) => b.rate - a.rate);
}

/**
 * Extract tool names from assertion failure messages.
 */
function extractMissingTools(messages: string[]): string[] {
  const tools: string[] = [];
  for (const msg of messages) {
    // Pattern: "toolName: expected X call(s), got 0"
    const match = msg.match(/^(\w+): expected/);
    if (match) {
      tools.push(match[1]);
    }
  }
  return [...new Set(tools)];
}

/**
 * Calculate statistics for an array of numbers.
 */
function calculateStats(values: number[]): MetricStats {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, values: [] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median =
    count % 2 === 0
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];
  const min = sorted[0];
  const max = sorted[count - 1];
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  return { count, mean, median, min, max, stdDev, values };
}
