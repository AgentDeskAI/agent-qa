/**
 * Reporter Types
 *
 * Interfaces for test result reporters.
 */

import type { ScenarioReport, StepReport, SuiteReport } from '../runner/types.js';
import type { Scenario, SuiteConfig, Step } from '../scenario/types.js';

/**
 * Reporter interface for test result output.
 *
 * All methods are optional - implement only what you need.
 */
export interface Reporter {
  /** Called when a suite starts */
  onSuiteStart?(suite: SuiteConfig): void | Promise<void>;

  /** Called when a scenario starts */
  onScenarioStart?(scenario: Scenario): void | Promise<void>;

  /** Called when a step completes */
  onStepComplete?(step: Step, report: StepReport): void | Promise<void>;

  /** Called when a scenario completes */
  onScenarioComplete?(scenario: Scenario, report: ScenarioReport): void | Promise<void>;

  /** Called when a suite completes */
  onSuiteComplete?(report: SuiteReport): void | Promise<void>;

  /** Called to finalize the reporter (flush output, close files, etc.) */
  finalize?(): void | Promise<void>;
}

/**
 * Reporter options.
 */
export interface ReporterOptions {
  /** Verbose output */
  verbose?: boolean;
  /** Show timestamps */
  showTimestamps?: boolean;
  /** Show tool calls */
  showToolCalls?: boolean;
  /** Show token usage */
  showUsage?: boolean;
  /** Show captured entities */
  showCaptured?: boolean;
}

/**
 * Console reporter options.
 */
export interface ConsoleReporterOptions extends ReporterOptions {
  /** Use colors */
  colors?: boolean;
  /** Output stream */
  stream?: NodeJS.WritableStream;
  /** Show diagnostics on failure (default: true when verbose) */
  showDiagnostics?: boolean;
  /** Max lines of diagnostic output to show (default: 5000) */
  maxDiagnosticLines?: number;
}
