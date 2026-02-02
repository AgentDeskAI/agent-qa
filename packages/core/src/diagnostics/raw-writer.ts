/**
 * Raw Diagnostics Writer
 *
 * Writes raw diagnostic data to files for progressive disclosure.
 * AI agents can read individual files as needed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// =============================================================================
// Types
// =============================================================================

/**
 * Failure metadata for the failure.json file.
 */
export interface FailureMetadata {
  scenarioId: string;
  scenarioName?: string;
  failedStep: {
    index: number;
    label?: string;
    type: string;
  };
  error: string;
  assertion?: unknown;
  timing: {
    scenarioStartTime: string;
    failureTime: string;
    totalDurationMs: number;
  };
  context: {
    userId?: string;
    conversationId?: string;
    correlationIds?: string[];
  };
}

/**
 * Success metadata for the success.json file.
 * Used when --save-diagnostics is passed for token analysis.
 */
export interface SuccessMetadata {
  scenarioId: string;
  scenarioName?: string;
  stepsCompleted: number;
  timing: {
    scenarioStartTime: string;
    completedTime: string;
    totalDurationMs: number;
  };
  context: {
    userId?: string;
    conversationId?: string;
    correlationIds?: string[];
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * HTTP response data from a chat step.
 */
export interface HttpResponseData {
  stepIndex: number;
  stepLabel?: string;
  message: string;
  response?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
  conversationId?: string;
  correlationId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
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
      type: string;
      text?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
      agent?: string;
      stepNumber?: number;
      origin?: string;
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
  durationMs: number;
}

/**
 * All diagnostic data for a failed scenario.
 */
export interface RawDiagnosticsData {
  /** Array of raw Tempo traces (one per chat step) */
  tempoTraces?: unknown[];
  /** Array of HTTP responses (one per chat step) */
  httpResponses?: HttpResponseData[];
  /** Raw tmux logs for the scenario */
  tmuxLogs?: string;
  /** Failure metadata */
  failure: FailureMetadata;
}

/**
 * Diagnostic data for a successful scenario (when --save-diagnostics is used).
 */
export interface SuccessDiagnosticsData {
  /** Array of HTTP responses (one per chat step) - main data for token analysis */
  httpResponses?: HttpResponseData[];
  /** Success metadata */
  success: SuccessMetadata;
  /** Raw tmux logs for the scenario */
  tmuxLogs?: string;
}

/**
 * Result of writing diagnostics.
 */
export interface WriteResult {
  /** Directory path where files were written */
  dirPath: string;
  /** List of files created */
  files: string[];
}

// =============================================================================
// Writer
// =============================================================================

/**
 * Create directory path for a scenario run.
 * Format: {outputDir}/{scenarioId}/{timestamp}/
 */
function createDirPath(outputDir: string, scenarioId: string): string {
  const timestamp = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  return path.join(outputDir, scenarioId, timestamp);
}

/**
 * Write raw diagnostics to files.
 *
 * Creates a directory structure:
 * ```
 * {outputDir}/{scenarioId}/{timestamp}/
 * ├── tempo-traces.json    # Array of raw Tempo traces
 * ├── http-responses.json  # Array of HTTP responses
 * ├── tmux-logs.txt        # Raw server logs
 * └── failure.json         # Failure metadata
 * ```
 *
 * @param outputDir Base output directory
 * @param scenarioId Scenario identifier
 * @param data Raw diagnostic data
 * @returns Directory path and list of files created
 */
export async function writeRawDiagnostics(
  outputDir: string,
  scenarioId: string,
  data: RawDiagnosticsData
): Promise<WriteResult> {
  const dirPath = createDirPath(outputDir, scenarioId);
  const files: string[] = [];

  // Ensure directory exists
  fs.mkdirSync(dirPath, { recursive: true });

  // Write failure.json (always present)
  const failurePath = path.join(dirPath, 'failure.json');
  fs.writeFileSync(failurePath, JSON.stringify(data.failure, null, 2));
  files.push('failure.json');

  // Write http-responses.json if present
  if (data.httpResponses && data.httpResponses.length > 0) {
    const httpPath = path.join(dirPath, 'http-responses.json');
    fs.writeFileSync(httpPath, JSON.stringify(data.httpResponses, null, 2));
    files.push(`http-responses.json (${data.httpResponses.length} responses)`);
  }

  // Write tempo-traces.json if present
  if (data.tempoTraces && data.tempoTraces.length > 0) {
    const tempoPath = path.join(dirPath, 'tempo-traces.json');
    fs.writeFileSync(tempoPath, JSON.stringify(data.tempoTraces, null, 2));
    files.push(`tempo-traces.json (${data.tempoTraces.length} traces)`);
  }

  // Write tmux-logs.txt if present
  if (data.tmuxLogs && data.tmuxLogs.trim().length > 0) {
    const tmuxPath = path.join(dirPath, 'tmux-logs.txt');
    fs.writeFileSync(tmuxPath, data.tmuxLogs);
    files.push('tmux-logs.txt');
  }

  return { dirPath, files };
}

/**
 * Create a raw diagnostics writer with configured output directory.
 */
export function createRawDiagnosticsWriter(outputDir: string) {
  return {
    write: (scenarioId: string, data: RawDiagnosticsData) =>
      writeRawDiagnostics(outputDir, scenarioId, data),
  };
}

/**
 * Write success diagnostics to files.
 * Used when --save-diagnostics is passed for token analysis on successful runs.
 *
 * Creates a directory structure:
 * ```
 * {outputDir}/{scenarioId}/{timestamp}/
 * ├── http-responses.json  # Array of HTTP responses with token usage
 * └── success.json         # Success metadata
 * ```
 *
 * @param outputDir Base output directory
 * @param scenarioId Scenario identifier
 * @param data Success diagnostic data
 * @returns Directory path and list of files created
 */
export async function writeSuccessDiagnostics(
  outputDir: string,
  scenarioId: string,
  data: SuccessDiagnosticsData
): Promise<WriteResult> {
  const dirPath = createDirPath(outputDir, scenarioId);
  const files: string[] = [];

  // Ensure directory exists
  fs.mkdirSync(dirPath, { recursive: true });

  // Write success.json
  const successPath = path.join(dirPath, 'success.json');
  fs.writeFileSync(successPath, JSON.stringify(data.success, null, 2));
  files.push('success.json');

  // Write http-responses.json if present (main file for token analysis)
  if (data.httpResponses && data.httpResponses.length > 0) {
    const httpPath = path.join(dirPath, 'http-responses.json');
    fs.writeFileSync(httpPath, JSON.stringify(data.httpResponses, null, 2));
    files.push(`http-responses.json (${data.httpResponses.length} responses)`);
  }

  // Write tmux-logs.txt if present
  if (data.tmuxLogs && data.tmuxLogs.trim().length > 0) {
    const tmuxPath = path.join(dirPath, 'tmux-logs.txt');
    fs.writeFileSync(tmuxPath, data.tmuxLogs);
    files.push('tmux-logs.txt');
  }

  return { dirPath, files };
}

/**
 * Append Tempo traces to an existing raw diagnostics directory.
 * Used for deferred trace collection at suite end.
 *
 * @param dirPath Existing diagnostics directory path
 * @param traces Array of raw Tempo traces to append
 * @returns Updated files list
 */
export function appendTempoTraces(dirPath: string, traces: unknown[]): string[] {
  if (!traces || traces.length === 0) {
    return [];
  }

  const tempoPath = path.join(dirPath, 'tempo-traces.json');
  fs.writeFileSync(tempoPath, JSON.stringify(traces, null, 2));
  return [`tempo-traces.json (${traces.length} traces)`];
}

/**
 * Read failure.json from a raw diagnostics directory.
 * Used to get correlationIds for deferred trace collection.
 */
export function readFailureMetadata(dirPath: string): FailureMetadata | null {
  try {
    const failurePath = path.join(dirPath, 'failure.json');
    const content = fs.readFileSync(failurePath, 'utf-8');
    return JSON.parse(content) as FailureMetadata;
  } catch {
    return null;
  }
}

/**
 * Read success.json from a raw diagnostics directory.
 * Used to get correlationIds for deferred trace collection on success scenarios.
 */
export function readSuccessMetadata(dirPath: string): SuccessMetadata | null {
  try {
    const successPath = path.join(dirPath, 'success.json');
    const content = fs.readFileSync(successPath, 'utf-8');
    return JSON.parse(content) as SuccessMetadata;
  } catch {
    return null;
  }
}
