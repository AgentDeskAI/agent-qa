/**
 * Markdown Reporter
 *
 * Generates markdown reports for test scenarios, with rich failure transcripts.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type { DiagnosticsData } from '../diagnostics/types.js';
import type { ScenarioReport, StepReport, ChatStepReport } from '../runner/types.js';
import type { Scenario } from '../scenario/types.js';

import type { Reporter } from './types.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Markdown reporter configuration.
 */
export interface MarkdownReporterConfig {
  /** Directory for report files */
  path: string;

  /**
   * Filename template.
   * Supports placeholders: {scenario}, {id}, {timestamp}, {status}
   * Default: '{id}-{timestamp}.md'
   */
  filename?: string;

  /** Only generate reports for failed scenarios (default: false) */
  onlyOnFailure?: boolean;

  /** Include diagnostics data in reports (default: true) */
  includeDiagnostics?: boolean;

  /** Include tool call details (default: true) */
  includeToolCalls?: boolean;

  /** Include captured entities (default: true) */
  includeEntities?: boolean;

  /** Include token usage (default: true) */
  includeUsage?: boolean;
}

// =============================================================================
// Reporter
// =============================================================================

/**
 * Create a markdown reporter that generates rich failure transcripts.
 *
 * @example
 * ```typescript
 * const reporter = createMarkdownReporter({
 *   path: './test-results',
 *   onlyOnFailure: true,
 *   includeDiagnostics: true,
 * });
 * ```
 */
export function createMarkdownReporter(config: MarkdownReporterConfig): Reporter {
  const {
    path: outputPath,
    filename = '{id}-{timestamp}.md',
    onlyOnFailure = false,
    includeDiagnostics = true,
    includeToolCalls = true,
    includeEntities = true,
    includeUsage = true,
  } = config;

  // Ensure output directory exists
  if (!existsSync(outputPath)) {
    mkdirSync(outputPath, { recursive: true });
  }

  return {
    onScenarioComplete(scenario: Scenario, report: ScenarioReport) {
      // Skip passed scenarios if configured
      if (onlyOnFailure && report.status === 'passed') {
        return;
      }

      const markdown = generateMarkdown(scenario, report, {
        includeDiagnostics,
        includeToolCalls,
        includeEntities,
        includeUsage,
      });

      const resolvedFilename = resolveFilename(filename, scenario, report);
      const filepath = join(outputPath, resolvedFilename);

      // Ensure parent directory exists
      const dir = dirname(filepath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filepath, markdown, 'utf-8');
    },
  };
}

// =============================================================================
// Markdown Generation
// =============================================================================

interface GenerateOptions {
  includeDiagnostics: boolean;
  includeToolCalls: boolean;
  includeEntities: boolean;
  includeUsage: boolean;
}

/**
 * Generate markdown content for a scenario report.
 */
function generateMarkdown(
  scenario: Scenario,
  report: ScenarioReport,
  options: GenerateOptions
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Test Report: ${scenario.id}`);
  lines.push('');

  // Status
  const statusIcon = report.status === 'passed' ? '✅' : '❌';
  lines.push(`**Status:** ${statusIcon} ${capitalize(report.status)}`);
  lines.push(`**Duration:** ${formatDuration(report.durationMs)}`);

  if (scenario.name) {
    lines.push(`**Name:** ${scenario.name}`);
  }
  if (scenario.tags?.length) {
    lines.push(`**Tags:** ${scenario.tags.join(', ')}`);
  }
  if (scenario.description) {
    lines.push(`**Description:** ${scenario.description}`);
  }

  // Token usage
  if (options.includeUsage && report.usage) {
    lines.push('');
    lines.push('**Token Usage:**');
    lines.push(`- Input: ${report.usage.inputTokens?.toLocaleString() ?? 'N/A'}`);
    lines.push(`- Output: ${report.usage.outputTokens?.toLocaleString() ?? 'N/A'}`);
    lines.push(`- Total: ${report.usage.totalTokens?.toLocaleString() ?? 'N/A'}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Steps
  lines.push('## Steps');
  lines.push('');

  for (const step of report.steps) {
    lines.push(formatStep(step, options));
    lines.push('');
  }

  // Captured entities
  if (options.includeEntities && Object.keys(report.captured).length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Captured Entities');
    lines.push('');

    for (const [alias, entity] of Object.entries(report.captured)) {
      lines.push(`### ${alias}`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(entity, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  // Diagnostics (on failure)
  const diagnostics = (report as ScenarioReportWithDiagnostics).diagnostics;
  if (options.includeDiagnostics && diagnostics?.length) {
    lines.push('---');
    lines.push('');
    lines.push('## Diagnostics');
    lines.push('');

    for (const diag of diagnostics) {
      lines.push(`### ${diag.title}`);
      lines.push('');
      lines.push(diag.content);
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated at ${new Date().toISOString()}*`);

  return lines.join('\n');
}

/**
 * Format a single step as markdown.
 */
function formatStep(step: StepReport, options: GenerateOptions): string {
  const lines: string[] = [];

  const icon = step.status === 'passed' ? '✅' : step.status === 'skipped' ? '⏭️' : '❌';
  const label = step.label ? ` \`${step.label}\`` : '';
  lines.push(`### Step ${step.index + 1}: ${capitalize(step.type)}${label} ${icon}`);
  lines.push('');
  lines.push(`**Status:** ${capitalize(step.status)} (${formatDuration(step.durationMs)})`);

  if (step.type === 'chat') {
    const chatStep = step as ChatStepReport;

    lines.push(`**Message:** "${chatStep.message}"`);

    if (chatStep.response) {
      const truncated = truncate(chatStep.response, 500);
      lines.push('');
      lines.push('**Response:**');
      lines.push('');
      lines.push('> ' + truncated.split('\n').join('\n> '));
    }

    // Tool calls
    if (options.includeToolCalls && chatStep.toolCalls?.length) {
      lines.push('');
      lines.push('**Tool Calls:**');
      for (const tool of chatStep.toolCalls) {
        const args = JSON.stringify(tool.args);
        const truncatedArgs = args.length > 100 ? args.slice(0, 100) + '...' : args;
        lines.push(`- \`${tool.name}\`: ${truncatedArgs}`);
      }
    }

    // Captured entities
    if (options.includeEntities && chatStep.captured && Object.keys(chatStep.captured).length > 0) {
      lines.push('');
      lines.push('**Captured:**');
      for (const [alias, entity] of Object.entries(chatStep.captured)) {
        lines.push(`- \`${alias}\`: ${entity.id}`);
      }
    }
  }

  if (step.type === 'verify') {
    lines.push(`**Entities verified:** ${(step as any).entitiesVerified ?? 0}`);
  }

  if (step.type === 'wait') {
    const waitStep = step as any;
    if (waitStep.pollAttempts) {
      lines.push(`**Poll attempts:** ${waitStep.pollAttempts}`);
    }
    if (waitStep.waitedSeconds) {
      lines.push(`**Waited:** ${waitStep.waitedSeconds}s`);
    }
  }

  if (step.type === 'setup') {
    const setupStep = step as any;
    lines.push(`**Entities inserted:** ${setupStep.entitiesInserted ?? 0}`);
    if (setupStep.aliasesCreated?.length) {
      lines.push(`**Aliases:** ${setupStep.aliasesCreated.join(', ')}`);
    }
  }

  // Error
  if (step.error) {
    lines.push('');
    lines.push('**Error:**');
    lines.push('```');
    lines.push(step.error);
    lines.push('```');
  }

  // Assertions
  if (step.assertions.length > 0) {
    const failed = step.assertions.filter((a) => !a.passed);
    if (failed.length > 0) {
      lines.push('');
      lines.push('**Failed Assertions:**');
      for (const assertion of failed) {
        lines.push(`- ${assertion.message || 'Assertion failed'}`);
        if (assertion.expected !== undefined && assertion.actual !== undefined) {
          lines.push(`  - Expected: \`${formatValue(assertion.expected)}\``);
          lines.push(`  - Actual: \`${formatValue(assertion.actual)}\``);
        }
      }
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Resolve filename template.
 */
function resolveFilename(
  template: string,
  scenario: Scenario,
  report: ScenarioReport
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = scenario.name?.replace(/[^a-zA-Z0-9-_]/g, '-') || 'unnamed';

  return template
    .replace('{id}', scenario.id)
    .replace('{scenario}', name)
    .replace('{timestamp}', timestamp)
    .replace('{status}', report.status);
}

/**
 * Format duration in milliseconds.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Capitalize first letter.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncate string with ellipsis.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '...';
}

/**
 * Format a value for display.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 100 ? value.slice(0, 100) + '...' : value;
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 100 ? str.slice(0, 100) + '...' : str;
  }
  return String(value);
}

// =============================================================================
// Extended Types
// =============================================================================

/**
 * ScenarioReport with optional diagnostics (added by runner on failure).
 */
interface ScenarioReportWithDiagnostics extends ScenarioReport {
  diagnostics?: DiagnosticsData[];
}
