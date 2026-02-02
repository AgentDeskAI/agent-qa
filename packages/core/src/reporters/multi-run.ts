/**
 * Multi-Run Reporter
 *
 * Console output and JSON export for aggregated multi-run results.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  MultiRunResult,
  AggregatedScenarioReport,
  AggregatedStepReport,
  MetricStats,
} from '../runner/types.js';

/**
 * ANSI color codes.
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

/**
 * Report multi-run results to console.
 */
export function reportMultiRunResults(result: MultiRunResult): void {
  const { aggregatedReport: report } = result;

  console.log('\n');
  console.log(colors.bold + '═'.repeat(60) + colors.reset);
  console.log(colors.bold + 'Multi-Run Summary' + colors.reset);
  console.log('═'.repeat(60));

  // Overall status
  const statusColor =
    report.passRate === 100 ? colors.green : report.passRate > 0 ? colors.yellow : colors.red;

  console.log(`\nScenario: ${colors.cyan}${report.name ?? report.id}${colors.reset}`);
  console.log(`Total Runs: ${report.totalRuns}`);
  console.log(`Pass Rate: ${statusColor}${report.passRate.toFixed(1)}%${colors.reset}`);
  console.log(`  ✓ Passed: ${report.passedRuns}`);
  console.log(`  ✗ Failed: ${report.failedRuns}`);
  if (report.errorRuns > 0) {
    console.log(`  ✗ Errors: ${report.errorRuns}`);
  }

  if (report.isFlaky) {
    console.log(
      `\n${colors.yellow}⚠ FLAKY: This scenario passes sometimes and fails sometimes${colors.reset}`
    );
  }

  // Step breakdown
  reportStepBreakdown(report);

  // Hallucination analysis
  reportHallucinations(report);

  // Token usage statistics
  reportUsageStats(report);

  // Cost statistics
  reportCostStats(report);

  // Duration
  console.log('\n' + colors.bold + 'Duration' + colors.reset);
  console.log('─'.repeat(60));
  console.log(`  Per-run: ${formatStats(report.durationStats, 'ms')}`);
  console.log(`  Total:   ${result.totalDurationMs.toLocaleString()}ms`);

  console.log('\n' + '═'.repeat(60));
}

/**
 * Report step breakdown.
 */
function reportStepBreakdown(report: AggregatedScenarioReport): void {
  console.log('\n' + colors.bold + 'Step Breakdown' + colors.reset);
  console.log('─'.repeat(60));

  // Only show steps that have failures or are flaky
  const interestingSteps = report.steps.filter(
    (step) => step.isFlaky || step.passRate < 100 || step.errors.length > 0
  );

  if (interestingSteps.length === 0) {
    console.log(`\n  ${colors.green}All steps passed consistently${colors.reset}`);
    return;
  }

  for (const step of interestingSteps) {
    reportStep(step);
  }
}

/**
 * Report a single step.
 */
function reportStep(step: AggregatedStepReport): void {
  const stepStatusColor =
    step.passRate === 100 ? colors.green : step.passRate > 0 ? colors.yellow : colors.red;

  const label = step.label ?? `Step ${step.index + 1}`;
  const flakyIndicator = step.isFlaky ? ` ${colors.yellow}(FLAKY)${colors.reset}` : '';

  console.log(`\n${label} [${step.type}]${flakyIndicator}`);
  console.log(
    `  Pass Rate: ${stepStatusColor}${step.passRate.toFixed(1)}%${colors.reset} (${step.passCount}/${step.passCount + step.failCount})`
  );
  console.log(`  Duration: ${formatStats(step.durationStats, 'ms')}`);

  if (step.errors.length > 0) {
    console.log('  Errors:');
    for (const err of step.errors.slice(0, 3)) {
      const truncatedMsg = err.message.length > 80 ? err.message.slice(0, 77) + '...' : err.message;
      console.log(`    - ${truncatedMsg} (${err.count}x)`);
    }
    if (step.errors.length > 3) {
      console.log(`    ${colors.dim}... and ${step.errors.length - 3} more${colors.reset}`);
    }
  }
}

/**
 * Report hallucination analysis.
 */
function reportHallucinations(report: AggregatedScenarioReport): void {
  if (report.hallucinations.length === 0) {
    return;
  }

  console.log('\n' + colors.bold + colors.red + 'Hallucination Detection' + colors.reset);
  console.log('─'.repeat(60));

  for (const h of report.hallucinations) {
    const label = h.stepLabel ?? `Step ${h.stepIndex + 1}`;
    console.log(
      `\n${colors.red}⚠ ${label}: ${h.rate.toFixed(1)}% hallucination rate${colors.reset}`
    );
    console.log(`  Occurred in ${h.occurrenceCount} of ${h.totalRuns} runs`);

    if (h.occurrences[0]) {
      const first = h.occurrences[0];
      if (first.missingToolCalls.length > 0) {
        console.log(`  Missing tools: ${first.missingToolCalls.join(', ')}`);
      }
      console.log(`  Response snippet: "${first.responseText.slice(0, 80)}..."`);
    }
  }
}

/**
 * Report token usage statistics.
 */
function reportUsageStats(report: AggregatedScenarioReport): void {
  if (!report.usageStats) {
    return;
  }

  console.log('\n' + colors.bold + 'Token Usage Statistics' + colors.reset);
  console.log('─'.repeat(60));
  console.log(`  Input:  ${formatStats(report.usageStats.inputTokens, 'tokens')}`);
  console.log(`  Output: ${formatStats(report.usageStats.outputTokens, 'tokens')}`);
  console.log(`  Total:  ${formatStats(report.usageStats.totalTokens, 'tokens')}`);
}

/**
 * Report cost statistics.
 */
function reportCostStats(report: AggregatedScenarioReport): void {
  if (!report.costStats) {
    return;
  }

  console.log('\n' + colors.bold + 'Cost Statistics' + colors.reset);
  console.log('─'.repeat(60));
  console.log(`  Input:       ${formatCostStats(report.costStats.inputCost)}`);
  console.log(`  Output:      ${formatCostStats(report.costStats.outputCost)}`);
  console.log(`  Cache Write: ${formatCostStats(report.costStats.cacheWriteCost)}`);
  console.log(`  Cache Read:  ${formatCostStats(report.costStats.cacheReadCost)}`);
  console.log(`  ${colors.bold}Total:       ${formatCostStats(report.costStats.totalCost)}${colors.reset}`);
}

/**
 * Format cost stats for display.
 */
function formatCostStats(stats: MetricStats): string {
  if (stats.count === 0) return 'N/A';

  if (stats.count === 1) {
    return `$${stats.mean.toFixed(4)}`;
  }

  return `$${stats.mean.toFixed(4)} (±$${stats.stdDev.toFixed(4)}, min: $${stats.min.toFixed(4)}, max: $${stats.max.toFixed(4)})`;
}

/**
 * Format stats for display.
 */
function formatStats(stats: MetricStats, unit: string): string {
  if (stats.count === 0) return 'N/A';

  if (stats.count === 1) {
    return formatNumber(stats.mean) + (unit ? ` ${unit}` : '');
  }

  const parts = [
    formatNumber(stats.mean),
    ` (±${formatNumber(stats.stdDev)}`,
    `, min: ${formatNumber(stats.min)}`,
    `, max: ${formatNumber(stats.max)})`,
  ];

  return parts.join('');
}

/**
 * Format a number with thousands separators.
 */
function formatNumber(n: number): string {
  return Math.round(n).toLocaleString();
}

/**
 * Export multi-run results to JSON file.
 */
export function exportMultiRunResults(result: MultiRunResult, outputPath: string): void {
  // Ensure directory exists
  const dir = dirname(outputPath);
  mkdirSync(dir, { recursive: true });

  // Create a serializable version (convert Date objects)
  const serializable = {
    ...result,
    startedAt: result.startedAt.toISOString(),
    endedAt: result.endedAt.toISOString(),
    aggregatedReport: {
      ...result.aggregatedReport,
      runReports: result.aggregatedReport.runReports.map((r) => ({
        ...r,
        startedAt: r.startedAt?.toISOString(),
      })),
    },
  };

  writeFileSync(outputPath, JSON.stringify(serializable, null, 2));
}
