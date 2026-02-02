/**
 * Diagnostics Types
 *
 * Interfaces for collecting diagnostic information on test failures.
 * Diagnostics providers collect logs, traces, and other context
 * to help debug why a test step failed.
 */

// =============================================================================
// Failure Context
// =============================================================================

/**
 * Context provided to diagnostics providers when a step fails.
 */
export interface FailureContext {
  /** Step index (0-based) */
  stepIndex: number;

  /** Step label (if provided) */
  stepLabel?: string;

  /** Step type */
  stepType: 'chat' | 'verify' | 'wait' | 'setup';

  /** Scenario ID */
  scenarioId: string;

  /** Scenario name */
  scenarioName?: string;

  /** Correlation ID from the agent response (for tracing) */
  correlationId?: string;

  /** Conversation ID */
  conversationId?: string;

  /** The error message */
  error: string;

  /** When the step started */
  startTime: Date;

  /** When the step failed */
  endTime: Date;

  /** User ID for this scenario */
  userId?: string;
}

// =============================================================================
// Diagnostics Data
// =============================================================================

/**
 * Diagnostic data collected by a provider.
 */
export interface DiagnosticsData {
  /**
   * Type of diagnostic data.
   * - 'logs': Log output (API logs, process output)
   * - 'trace': Distributed trace data
   * - 'custom': Custom diagnostic data
   */
  type: 'logs' | 'trace' | 'custom';

  /**
   * Display title for this diagnostic data.
   * Shown in reports (e.g., "API Server Logs", "OpenTelemetry Trace").
   */
  title: string;

  /**
   * Markdown-formatted content for display in reports.
   * Should be human-readable.
   */
  content: string;

  /**
   * Raw data for JSON reports and programmatic access.
   */
  raw?: unknown;

  /**
   * Path to full markdown diagnostic file (when outputDir is configured).
   * Only present for unified diagnostics.
   */
  markdownPath?: string;
}

// =============================================================================
// Diagnostics Provider Interface
// =============================================================================

/**
 * Interface for collecting diagnostic data on failure.
 *
 * Implement this interface to add custom diagnostics collection.
 * Built-in providers include:
 * - TmuxLogProvider: Capture logs from tmux sessions
 * - TempoTraceProvider: Fetch OpenTelemetry traces from Tempo
 * - DockerLogProvider: Capture Docker container logs
 * - FileLogProvider: Read from log files
 *
 * @example
 * ```typescript
 * const myProvider: DiagnosticsProvider = {
 *   name: 'slack-alert',
 *   async collect(context) {
 *     await postToSlack(`Test failed: ${context.scenarioId}`);
 *     return null; // No data to include in report
 *   },
 * };
 * ```
 */
export interface DiagnosticsProvider {
  /**
   * Unique name for this provider.
   * Used in reports to identify the source of diagnostics.
   */
  name: string;

  /**
   * Whether this provider should be deferred until suite end.
   * Deferred providers (like Tempo traces) are collected in parallel
   * at the end of the suite run, rather than immediately after each failure.
   * This optimizes for latency when multiple tests fail.
   */
  deferred?: boolean;

  /**
   * Collect diagnostic data for a failed step.
   *
   * @param context - Information about the failure
   * @returns Diagnostic data, or null if no relevant data found
   */
  collect(context: FailureContext): Promise<DiagnosticsData | null>;

  /**
   * Optional cleanup method.
   */
  cleanup?(): Promise<void>;
}

// =============================================================================
// Provider Configurations (Declarative)
// =============================================================================

/**
 * Configuration for TmuxLogProvider.
 */
export interface TmuxConfig {
  /** Tmux session name to capture logs from */
  sessionName: string;

  /** Number of lines to capture (default: 100) */
  lines?: number;

  /** Only capture logs after step start time (default: true) */
  filterByTime?: boolean;

  /** Clear tmux buffer before each scenario (default: false) */
  clearBeforeScenario?: boolean;
}

// =============================================================================
// Diagnostics Config
// =============================================================================

/**
 * Declarative config for built-in providers.
 *
 * @example
 * ```typescript
 * import { createTempoProvider } from '@agent-qa/traces-tempo';
 *
 * diagnostics: {
 *   tmux: { sessionName: 'api-server' },
 *   traces: { provider: createTempoProvider({ url: 'http://localhost:3200' }) },
 * }
 * ```
 */
export interface DiagnosticsConfig {
  /** Tmux log provider config */
  tmux?: TmuxConfig;

  /** Escape hatch for custom providers */
  custom?: DiagnosticsProvider[];

  /** Max lines to display in console output (default: 5000) */
  maxDiagnosticLines?: number;

  /** Directory to save markdown diagnostic reports (optional) */
  outputDir?: string;
}

// =============================================================================
// Diagnostics Collector
// =============================================================================

/**
 * Agent response data for unified report.
 */
export interface AgentResponseContext {
  text?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
  conversationId?: string;
  correlationId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  /** Detailed usage data from HTTP response (per-agent breakdown, events, totals) */
  detailedUsage?: DetailedUsageContext;
  durationMs?: number;
  statusCode?: number;
}

/**
 * Detailed usage context (compatible with DetailedUsage from adapters).
 * Uses looser types for events to allow any type string.
 */
export interface DetailedUsageContext {
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
}

