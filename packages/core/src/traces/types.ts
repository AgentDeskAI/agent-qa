/**
 * Traces Provider Types
 *
 * Defines the interface for trace providers and backend-agnostic domain types.
 * Any tracing backend (Tempo, LangFuse, Jaeger, etc.) can implement TracesProvider.
 */

// =============================================================================
// Span Types
// =============================================================================

/**
 * Span type classification for display and filtering.
 */
export type SpanType =
  | 'http-server'
  | 'http-client'
  | 'agent'
  | 'orchestrator'
  | 'tool'
  | 'db'
  | 'lifecycle'
  | 'llm'
  | 'internal';

/**
 * Span status representing success, error, or unset.
 */
export type SpanStatus = 'ok' | 'error' | 'unset';

// =============================================================================
// Parsed Trace Types (Backend-Agnostic)
// =============================================================================

/**
 * A parsed span from a distributed trace.
 * This format is backend-agnostic and can represent spans from any tracing system.
 */
export interface ParsedSpan {
  /** Unique span identifier */
  id: string;

  /** Parent span ID (null for root spans) */
  parentId: string | null;

  /** Trace ID this span belongs to */
  traceId: string;

  /** Original span name */
  name: string;

  /** Human-friendly display name */
  displayName: string;

  /** Classified span type */
  spanType: SpanType;

  /** Service name (optional, may be on trace instead) */
  serviceName?: string;

  /** When the span started */
  startTime: Date;

  /** When the span ended */
  endTime: Date;

  /** Duration in milliseconds */
  duration: number;

  /** Span status */
  status: SpanStatus;

  /** Status message (typically for errors) */
  statusMessage: string;

  /** Span attributes as flat key-value pairs */
  attributes: Record<string, string | number | boolean>;

  /** Child spans (built after parsing) */
  children: ParsedSpan[];

  /** Depth in the span tree (0 for root) */
  depth: number;

  /** Span events (exceptions, logs, etc.) */
  events?: SpanEvent[];
}

/**
 * A span event (exception, log, etc.)
 */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, unknown>;
}

/**
 * Metrics calculated from trace spans.
 */
export interface TraceMetrics {
  /** Total input tokens across all LLM calls */
  inputTokens: number;

  /** Total output tokens across all LLM calls */
  outputTokens: number;

  /** Sum of input and output tokens */
  totalTokens: number;

  /** Tokens read from cache */
  cachedTokens: number;

  /** Estimated cost in USD */
  costUsd: number;

  /** Number of agent spans */
  agentCount: number;

  /** Number of tool spans */
  toolCount: number;

  /** Number of database operations */
  dbOperations: number;

  /** Number of LLM calls */
  llmCalls: number;

  // Legacy fields for backward compatibility
  totalDuration?: number;
  spanCount?: number;
  serviceCount?: number;
  errorCount?: number;
}

/**
 * A fully parsed trace with all spans and calculated metrics.
 */
export interface ParsedTrace {
  /** Trace ID */
  traceId: string;

  /** Primary service name (from root span) */
  serviceName: string;

  /** Root span name */
  rootSpanName: string;

  /** When the trace started */
  startTime: Date;

  /** When the trace ended */
  endTime: Date;

  /** Total duration in milliseconds */
  duration: number;

  /** Overall trace status */
  status: SpanStatus;

  /** All spans in the trace (flat list) */
  spans: ParsedSpan[];

  /** Root span with children tree built */
  rootSpan: ParsedSpan | null;

  /** Calculated metrics */
  metrics: TraceMetrics;
}

/**
 * Summary result from a trace search operation.
 */
export interface TraceSearchResult {
  traceId: string;
  serviceName: string;
  rootSpanName: string;
  startTime: Date;
  duration: number;
}

// =============================================================================
// Search Options
// =============================================================================

/**
 * Options for searching traces.
 */
export interface TraceSearchOptions {
  /** Maximum number of results */
  limit?: number;

  /** Start time (Unix timestamp in seconds) */
  start?: number;

  /** End time (Unix timestamp in seconds) */
  end?: number;

  /** Filter by service name */
  service?: string;

  /** Filter by correlation ID */
  correlationId?: string;

  /** Additional backend-specific filters */
  tags?: Record<string, string>;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Status information from a traces provider.
 */
export interface TracesProviderStatus {
  /** Whether the provider is reachable */
  reachable: boolean;

  /** Backend URL if applicable */
  url?: string;

  /** Backend version if available */
  version?: string;

  /** Additional status info */
  info?: Record<string, unknown>;
}

/**
 * Interface for trace providers.
 *
 * Implement this interface to add support for a new tracing backend.
 * The core framework uses this interface to fetch traces for diagnostics.
 *
 * @example
 * ```typescript
 * const myProvider: TracesProvider = {
 *   name: 'langfuse',
 *   async isReachable() {
 *     return await checkLangfuseConnection();
 *   },
 *   async getTraceByCorrelationId(id) {
 *     const trace = await langfuse.getTraceBySessionId(id);
 *     return convertToParsedTrace(trace);
 *   },
 * };
 * ```
 */
export interface TracesProvider {
  /**
   * Provider name for display and logging.
   * Should be a simple identifier like 'tempo', 'langfuse', 'jaeger'.
   */
  readonly name: string;

  /**
   * Check if the tracing backend is reachable.
   * Used for preflight checks and status reporting.
   */
  isReachable(): Promise<boolean>;

  /**
   * Get a parsed trace by correlation ID.
   * The correlation ID is typically set via `ai.correlation_id` span attribute.
   *
   * @param correlationId - The correlation ID to search for
   * @returns Parsed trace or null if not found
   */
  getTraceByCorrelationId(correlationId: string): Promise<ParsedTrace | null>;

  /**
   * Search for traces matching the given options.
   * Optional - not all providers support search.
   *
   * @param options - Search options
   * @returns Array of search results
   */
  searchTraces?(options: TraceSearchOptions): Promise<TraceSearchResult[]>;

  /**
   * Get detailed status information.
   * Optional - provides more info than isReachable().
   */
  getStatus?(): Promise<TracesProviderStatus>;

  /**
   * Cleanup any resources held by the provider.
   * Optional - called when the provider is no longer needed.
   */
  cleanup?(): Promise<void>;
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Configuration for the traces provider in diagnostics.
 */
export interface TracesProviderConfig {
  /** The traces provider instance */
  provider: TracesProvider;

  /** Whether to include span details in reports (default: true) */
  includeSpans?: boolean;
}
