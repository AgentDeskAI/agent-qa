/**
 * Diagnostics Module
 *
 * Provides failure diagnostics collection for agent testing.
 *
 * The primary approach is raw diagnostics (writeRawDiagnostics) which writes
 * separate files for each diagnostic source:
 * - failure.json - Failure metadata
 * - http-responses.json - All HTTP responses from chat steps
 * - tmux-logs.txt - Raw server logs
 * - tempo-traces.json - OpenTelemetry traces (collected at suite end)
 */

// Types
export type {
  FailureContext,
  DiagnosticsData,
  DiagnosticsProvider,
  DiagnosticsConfig,
  TmuxConfig,
} from './types.js';

// Raw diagnostics writer (primary approach)
export {
  writeRawDiagnostics,
  writeSuccessDiagnostics,
  appendTempoTraces,
  readFailureMetadata,
  readSuccessMetadata,
  createRawDiagnosticsWriter,
  type FailureMetadata,
  type SuccessMetadata,
  type HttpResponseData,
  type RawDiagnosticsData,
  type SuccessDiagnosticsData,
  type WriteResult,
} from './raw-writer.js';

// Tmux provider
export {
  createTmuxLogProvider,
  captureTmuxLogs,
  clearTmuxBuffer,
  hasTmuxSession,
  parseUsageReport,
  type ParsedUsageReport,
} from './tmux-logs.js';

// Generic traces provider (for any TracesProvider implementation)
export {
  createTracesDiagnosticsProvider,
  collectTracesForCorrelationIds,
  type EnrichedTraceData,
  type WorkflowData,
} from './traces-provider.js';
