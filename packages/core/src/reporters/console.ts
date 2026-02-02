/**
 * Console Reporter
 *
 * Colored terminal output for test results.
 */

import type { ScenarioReport, StepReport, SuiteReport } from '../runner/types.js';
import type { Scenario, SuiteConfig, Step } from '../scenario/types.js';

import type { Reporter, ConsoleReporterOptions } from './types.js';

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
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Status symbols.
 */
const symbols = {
  passed: '✓',
  failed: '✗',
  skipped: '○',
  error: '✗',
  pending: '◌',
};

/**
 * Console reporter for terminal output.
 */
export class ConsoleReporter implements Reporter {
  private readonly options: ConsoleReporterOptions;
  private readonly useColors: boolean;
  private readonly stream: NodeJS.WritableStream;
  private currentScenario?: Scenario;
  private stepCount = 0;

  constructor(options: ConsoleReporterOptions = {}) {
    this.options = options;
    this.useColors = options.colors ?? true;
    this.stream = options.stream ?? process.stdout;
  }

  /**
   * Called when a suite starts.
   */
  onSuiteStart(suite: SuiteConfig): void {
    this.writeLine('');
    this.writeLine(this.color('bold', `Running suite: ${suite.name ?? 'Unnamed Suite'}`));
    this.writeLine(this.color('dim', '─'.repeat(60)));
  }

  /**
   * Called when a scenario starts.
   */
  onScenarioStart(scenario: Scenario): void {
    this.currentScenario = scenario;
    this.stepCount = 0;
    this.writeLine('');
    this.writeLine(this.color('cyan', `${scenario.name ?? scenario.id}`));
  }

  /**
   * Called when a step completes.
   */
  onStepComplete(step: Step, report: StepReport): void {
    this.stepCount++;
    const prefix = this.getStatusPrefix(report.status);
    const label = report.label ?? `Step ${this.stepCount}`;
    const duration = this.color('dim', `(${report.durationMs}ms)`);

    if (this.options.verbose) {
      this.writeLine(`  ${prefix} ${label} ${duration}`);

      // Show message for chat steps
      if (report.type === 'chat' && 'message' in report) {
        const chatReport = report as { message?: string; response?: string; toolCalls?: Array<{ name: string }> };
        this.writeLine(this.color('dim', `    → "${truncate(chatReport.message ?? '', 60)}"`));

        // Show tool calls
        if (this.options.showToolCalls && chatReport.toolCalls && chatReport.toolCalls.length > 0) {
          const toolNames = chatReport.toolCalls.map((t) => t.name).join(', ');
          this.writeLine(this.color('dim', `    Tools: ${toolNames}`));
        }

        // Show response
        if (chatReport.response) {
          this.writeLine(this.color('dim', `    ← "${truncate(chatReport.response, 60)}"`));
        }
      }

      // Show error
      if (report.error) {
        this.writeLine(this.color('red', `    Error: ${report.error}`));
      }
    } else {
      // Compact mode - just show status symbol
      this.write(this.getStatusSymbol(report.status));
    }
  }

  /**
   * Called when a scenario completes.
   */
  onScenarioComplete(scenario: Scenario, report: ScenarioReport): void {
    if (!this.options.verbose) {
      // Finish the status line
      this.writeLine('');
    }

    const prefix = this.getStatusPrefix(report.status);
    const duration = this.color('dim', `(${report.durationMs}ms)`);
    const steps = this.color('dim', `${report.steps.length} steps`);

    this.writeLine(`  ${prefix} ${report.status.toUpperCase()} ${duration} ${steps}`);

    // Show usage and cost
    if (this.options.showUsage && report.usage) {
      const { inputTokens, outputTokens, totalTokens } = report.usage;
      const costStr = report.cost ? ` | $${report.cost.totalCost.toFixed(4)}` : '';
      this.writeLine(
        this.color('dim', `    Tokens: ${totalTokens.toLocaleString()} (in: ${inputTokens.toLocaleString()}, out: ${outputTokens.toLocaleString()})${costStr}`)
      );
    }

    // Show captured entities
    if (this.options.showCaptured && Object.keys(report.captured).length > 0) {
      this.writeLine(this.color('dim', `    Captured: ${Object.keys(report.captured).join(', ')}`));
    }

    // Show error for failed scenarios
    if (report.error && !this.options.verbose) {
      this.writeLine(this.color('red', `    Error: ${report.error}`));
    }

    // Show raw diagnostics paths (for failures OR when --save-diagnostics was used)
    if (report.rawDiagnostics) {
      this.writeLine('');
      this.writeLine(this.color('cyan', `  Diagnostics: ${report.rawDiagnostics.dirPath}`));
      for (const file of report.rawDiagnostics.files) {
        this.writeLine(this.color('dim', `    → ${file}`));
      }
    }

    // Show legacy diagnostics for failed scenarios (when verbose or showDiagnostics)
    if ((report.status === 'failed' || report.status === 'error') &&
        !report.rawDiagnostics &&
        report.diagnostics &&
        report.diagnostics.length > 0 &&
        (this.options.verbose || this.options.showDiagnostics)) {
      this.writeLine('');
      this.writeLine(this.color('cyan', '  Diagnostics:'));
      for (const diag of report.diagnostics) {
        this.writeLine(this.color('yellow', `    ━━━ ${diag.title} ━━━`));
        // Show content, indented
        const lines = diag.content.split('\n');
        const maxLines = this.options.maxDiagnosticLines ?? 5000;
        const displayLines = lines.slice(0, maxLines);
        for (const line of displayLines) {
          this.writeLine(this.color('dim', `    ${line}`));
        }
        if (lines.length > maxLines) {
          this.writeLine(this.color('dim', `    ... (${lines.length - maxLines} more lines)`));
        }
        // Show markdown file path if available
        if (diag.markdownPath) {
          this.writeLine('');
          this.writeLine(this.color('cyan', `    Full report saved to: ${diag.markdownPath}`));
        }
      }
    }

    this.currentScenario = undefined;
  }

  /**
   * Called when a suite completes.
   */
  onSuiteComplete(report: SuiteReport): void {
    this.writeLine('');
    this.writeLine(this.color('dim', '─'.repeat(60)));
    this.writeLine('');

    // Summary
    const passedColor = report.passed > 0 ? 'green' : 'dim';
    const failedColor = report.failed > 0 ? 'red' : 'dim';
    const skippedColor = report.skipped > 0 ? 'yellow' : 'dim';
    const errorsColor = report.errors > 0 ? 'red' : 'dim';

    this.writeLine('Summary:');
    this.writeLine(this.color(passedColor, `  ${symbols.passed} ${report.passed} passed`));
    if (report.failed > 0) {
      this.writeLine(this.color(failedColor, `  ${symbols.failed} ${report.failed} failed`));
    }
    if (report.skipped > 0) {
      this.writeLine(this.color(skippedColor, `  ${symbols.skipped} ${report.skipped} skipped`));
    }
    if (report.errors > 0) {
      this.writeLine(this.color(errorsColor, `  ${symbols.error} ${report.errors} errors`));
    }

    this.writeLine('');
    this.writeLine(this.color('dim', `Total: ${report.total} scenarios in ${report.durationMs}ms`));

    // Show total usage and cost
    if (this.options.showUsage && report.usage) {
      const { inputTokens, outputTokens, totalTokens } = report.usage;
      this.writeLine(
        this.color('dim', `Tokens: ${totalTokens.toLocaleString()} (in: ${inputTokens.toLocaleString()}, out: ${outputTokens.toLocaleString()})`)
      );
    }
    if (report.cost && report.cost.totalCost > 0) {
      this.writeLine(
        this.color('dim', `Cost: $${report.cost.totalCost.toFixed(4)} (in: $${report.cost.inputCost.toFixed(4)}, out: $${report.cost.outputCost.toFixed(4)}, cache: $${(report.cost.cacheWriteCost + report.cost.cacheReadCost).toFixed(4)})`)
      );
    }

    this.writeLine('');
  }

  /**
   * Finalize the reporter.
   */
  finalize(): void {
    // Nothing to clean up for console reporter
  }

  /**
   * Get status prefix with color.
   */
  private getStatusPrefix(status: string): string {
    switch (status) {
      case 'passed':
        return this.color('green', symbols.passed);
      case 'failed':
        return this.color('red', symbols.failed);
      case 'skipped':
        return this.color('yellow', symbols.skipped);
      case 'error':
        return this.color('red', symbols.error);
      default:
        return this.color('dim', symbols.pending);
    }
  }

  /**
   * Get status symbol (for compact mode).
   */
  private getStatusSymbol(status: string): string {
    switch (status) {
      case 'passed':
        return this.color('green', '.');
      case 'failed':
        return this.color('red', 'F');
      case 'skipped':
        return this.color('yellow', 'S');
      case 'error':
        return this.color('red', 'E');
      default:
        return this.color('dim', '?');
    }
  }

  /**
   * Apply color to text.
   */
  private color(colorName: keyof typeof colors, text: string): string {
    if (!this.useColors) return text;
    return `${colors[colorName]}${text}${colors.reset}`;
  }

  /**
   * Write text to stream.
   */
  private write(text: string): void {
    this.stream.write(text);
  }

  /**
   * Write text with newline to stream.
   */
  private writeLine(text: string): void {
    this.stream.write(text + '\n');
  }
}

/**
 * Create a console reporter.
 */
export function createConsoleReporter(options?: ConsoleReporterOptions): ConsoleReporter {
  return new ConsoleReporter(options);
}

/**
 * Truncate text for display.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
