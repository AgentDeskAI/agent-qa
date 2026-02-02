/**
 * Tempo Traces Provider
 *
 * Implements the TracesProvider interface for Grafana Tempo.
 *
 * @example
 * ```typescript
 * import { createTempoProvider } from '@agent-qa/traces-tempo';
 *
 * const provider = createTempoProvider({
 *   url: 'http://localhost:3200',
 * });
 *
 * // Use with agent-qa diagnostics
 * export default defineConfig({
 *   diagnostics: {
 *     traces: { provider }
 *   }
 * });
 * ```
 */

import type {
  TracesProvider,
  TracesProviderStatus,
  ParsedTrace,
  TraceSearchOptions,
  TraceSearchResult,
} from '@agent-qa/core/traces';
import {
  fetchTrace,
  searchTraces as tempoSearchTraces,
  searchByCorrelationId,
  isTempoReachable,
  getStatus as getTempoStatus,
  parseTimeRange,
  type SearchOptions,
} from './client.js';
import { parseTempoResponse } from './parser.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for the Tempo provider.
 */
export interface TempoProviderConfig {
  /**
   * Tempo server URL.
   * Defaults to TEMPO_URL env var or 'http://localhost:3200'.
   */
  url?: string;

  /**
   * Request timeout in milliseconds.
   * Defaults to TEMPO_TIMEOUT env var or 30000.
   */
  timeout?: number;

  /**
   * Attribute name for correlation ID lookup.
   * Defaults to 'ai.correlation_id'.
   */
  correlationIdAttribute?: string;
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Create a Tempo traces provider.
 *
 * This provider fetches OpenTelemetry traces from Grafana Tempo and converts
 * them to the standard ParsedTrace format.
 *
 * @param config - Optional configuration
 * @returns TracesProvider implementation for Tempo
 *
 * @example
 * ```typescript
 * // Basic usage with defaults (localhost:3200)
 * const provider = createTempoProvider();
 *
 * // With custom URL
 * const provider = createTempoProvider({
 *   url: 'http://tempo.internal:3200',
 *   timeout: 60000,
 * });
 *
 * // Check if Tempo is available
 * const reachable = await provider.isReachable();
 *
 * // Get trace by correlation ID
 * const trace = await provider.getTraceByCorrelationId('conv_abc123');
 * ```
 */
export function createTempoProvider(config?: TempoProviderConfig): TracesProvider {
  // Apply config to environment if provided
  // The client reads from env vars, so we set them here
  if (config?.url) {
    process.env.TEMPO_URL = config.url;
  }
  if (config?.timeout) {
    process.env.TEMPO_TIMEOUT = String(config.timeout);
  }

  return {
    name: 'tempo',

    async isReachable(): Promise<boolean> {
      return isTempoReachable();
    },

    async getTraceByCorrelationId(correlationId: string): Promise<ParsedTrace | null> {
      // Search for trace by correlation ID
      const searchResult = await searchByCorrelationId(correlationId, { limit: 1 });

      if (searchResult.traces.length === 0) {
        return null;
      }

      // Fetch the full trace
      const traceId = searchResult.traces[0].traceID;
      const rawTrace = await fetchTrace(traceId);

      // Parse to standard format
      return parseTempoResponse(rawTrace);
    },

    async searchTraces(options: TraceSearchOptions): Promise<TraceSearchResult[]> {
      const searchOptions: SearchOptions = {
        limit: options.limit,
        start: options.start,
        end: options.end,
        service: options.service,
        correlationId: options.correlationId,
      };

      const result = await tempoSearchTraces(searchOptions);

      return result.traces.map((t) => ({
        traceId: t.traceID,
        serviceName: t.rootServiceName,
        rootSpanName: t.rootTraceName,
        startTime: new Date(parseInt(t.startTimeUnixNano, 10) / 1_000_000),
        duration: t.durationMs,
      }));
    },

    async getStatus(): Promise<TracesProviderStatus> {
      const status = await getTempoStatus();
      return {
        reachable: status.reachable,
        url: status.url,
        version: status.version,
      };
    },
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Re-export parseTimeRange for convenience.
 */
export { parseTimeRange };
