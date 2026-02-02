/**
 * Reporters Module
 *
 * Test result output formatters.
 */

// Types
export type {
  Reporter,
  ReporterOptions,
  ConsoleReporterOptions,
} from './types.js';

// Console Reporter
export { ConsoleReporter, createConsoleReporter } from './console.js';

// Markdown Reporter
export { createMarkdownReporter } from './markdown.js';
export type { MarkdownReporterConfig } from './markdown.js';

// Multi-Run Reporter
export { reportMultiRunResults, exportMultiRunResults } from './multi-run.js';
