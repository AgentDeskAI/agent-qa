/**
 * Agent QA Configuration Types
 *
 * Defines the schema for agent-qa.config.ts files.
 */

// =============================================================================
// Entity Configuration
// =============================================================================

/**
 * A Drizzle table type (loosely typed to avoid version-specific constraints).
 *
 * Modern Drizzle versions use Symbol-based properties instead of `table._`.
 * The adapter uses `getTableName()` and `getTableColumns()` from drizzle-orm
 * to introspect table metadata.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrizzleTable = Record<string, any>;

/**
 * Configuration for a database entity.
 *
 * The framework introspects the Drizzle table to determine column metadata.
 * Users specify semantic information (name, title column, user ID column).
 */
export interface EntityConfig<T extends DrizzleTable = DrizzleTable> {
  /** The Drizzle table object */
  table: T;

  /** Entity name used in scenarios (e.g., 'tasks', 'reminders') */
  name: string;

  /** Column used for title-based lookups */
  titleColumn?: string;

  /** Column containing the user ID for filtering (null to disable) */
  userIdColumn?: string | null;

  /** Custom insert logic (optional - overrides auto-generated) */
  insert?: (db: unknown, data: Record<string, unknown>) => Promise<{ id: string }>;
}

// =============================================================================
// Agent Configuration
// =============================================================================

/**
 * Configuration for the AI agent endpoint.
 */
export interface AgentConfig {
  /** Base URL of the API (supports $ENV_VAR syntax) */
  baseUrl: string;

  /** Authentication token (supports $ENV_VAR syntax) */
  token: string;

  /** Chat endpoint path (default: '/v1/chat') */
  chatEndpoint?: string;

  /** Additional headers to include in requests */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;

  /** Number of retry attempts for transient failures (default: 0) */
  retries?: number;

  /** Base delay in ms between retries, doubled for each attempt (default: 1000) */
  retryDelay?: number;

  /** HTTP status codes to retry on (default: [502, 503, 504]) */
  retryOn?: number[];
}

// =============================================================================
// Database Configuration
// =============================================================================

/**
 * Configuration for the database connection using Drizzle ORM.
 */
export interface DrizzleDatabaseConfig {
  /** Connection URL (supports $ENV_VAR syntax) */
  url: string;

  /** Entity configurations */
  entities: EntityConfig[];

  /** Default user ID column name across all entities (default: 'userId') */
  defaultUserIdColumn?: string;
}

/**
 * Configuration for a custom database adapter.
 *
 * Use this when you want to provide your own DatabaseAdapter implementation
 * instead of using the built-in Drizzle adapter.
 *
 * @example
 * ```typescript
 * import { defineConfig } from '@agent-qa/core';
 * import { myCustomAdapter } from './my-adapter';
 *
 * export default defineConfig({
 *   name: 'MyApp',
 *   database: {
 *     adapter: myCustomAdapter,
 *   },
 *   // ... rest of config
 * });
 * ```
 */
export interface CustomDatabaseConfig {
  /** Custom database adapter instance */
  adapter: unknown; // Typed as unknown to avoid circular imports; runtime checks ensure it's a DatabaseAdapter
}

/**
 * Database configuration - either Drizzle ORM config or a custom adapter.
 */
export type DatabaseConfig = DrizzleDatabaseConfig | CustomDatabaseConfig;

/**
 * Type guard to check if config is a custom adapter config.
 */
export function isCustomDatabaseConfig(config: DatabaseConfig): config is CustomDatabaseConfig {
  return 'adapter' in config;
}

/**
 * Type guard to check if config is a Drizzle database config.
 */
export function isDrizzleDatabaseConfig(config: DatabaseConfig): config is DrizzleDatabaseConfig {
  return 'url' in config && 'entities' in config;
}

// =============================================================================
// Vector Store Configuration
// =============================================================================

/**
 * Configuration for vector store connections (e.g., Milvus).
 */
export interface VectorStoreConfig {
  /** Vector store type */
  type: 'milvus';

  /** Host address (default: localhost) */
  host?: string;

  /** Port number (supports $ENV_VAR syntax) */
  port?: number | string;

  /** Verbose logging */
  verbose?: boolean;
}

// =============================================================================
// Global Setup Configuration (Vitest-like)
// =============================================================================

/**
 * Scenario info passed to hooks.
 */
export interface ScenarioInfo {
  /** Scenario ID */
  id: string;

  /** Scenario name */
  name: string;

  /** Tags */
  tags?: string[];
}

/**
 * Result info passed to afterEach hook.
 */
export interface ScenarioResultInfo {
  /** Whether the scenario passed */
  passed: boolean;

  /** Error message if failed */
  error?: string;

  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Context passed to lifecycle hooks.
 * Contains information about the execution context like user isolation.
 */
export interface HookContext {
  /** User ID for this scenario (may be unique per scenario in parallel mode) */
  userId: string;
}

/**
 * Lifecycle hooks for test execution.
 *
 * @example
 * ```typescript
 * // agentqa.config.ts - Basic hooks (no user isolation)
 * export default defineConfig({
 *   hooks: {
 *     beforeAll: async () => {
 *       await clearDatabase();
 *     },
 *     afterEach: async (scenario, result) => {
 *       if (!result.passed) {
 *         await captureScreenshot(scenario.id);
 *       }
 *     },
 *   },
 * });
 *
 * // With user isolation for parallel execution
 * export default defineConfig({
 *   hooks: {
 *     beforeEach: async (scenario, context) => {
 *       // Use context?.userId for parallel-safe cleanup
 *       const userId = context?.userId ?? DEFAULT_USER_ID;
 *       await cleanupUserData(userId);
 *     },
 *   },
 * });
 * ```
 */
export interface LifecycleHooks {
  /** Run once before all scenarios */
  beforeAll?: () => Promise<void>;

  /** Run once after all scenarios */
  afterAll?: () => Promise<void>;

  /**
   * Run before each scenario.
   * In parallel mode, context.userId contains a unique user ID for this scenario.
   */
  beforeEach?: (scenario: ScenarioInfo, context?: HookContext) => Promise<void>;

  /**
   * Run after each scenario.
   * In parallel mode, context.userId contains the same user ID used for beforeEach.
   */
  afterEach?: (scenario: ScenarioInfo, result: ScenarioResultInfo, context?: HookContext) => Promise<void>;
}

// =============================================================================
// Setup Configuration
// =============================================================================

/**
 * Custom setup handler result.
 */
export interface ProcessResult {
  success: boolean;
  status: string;
  message?: string;
  conversationId?: string;
}

/**
 * Setup executor configuration for custom entity setup logic.
 */
export interface SetupConfig {
  /** Custom setup handlers */
  handlers?: {
    /** Custom action handlers (e.g., processReminder) */
    actions?: Record<string, (db: unknown, id: string) => Promise<ProcessResult>>;

    /** Custom insert handlers by entity name */
    inserts?: Record<string, (db: unknown, data: Record<string, unknown>) => Promise<{ id: string }>>;
  };
}

// =============================================================================
// Relationship Configuration
// =============================================================================

/**
 * Pattern for semantic relationship assertions.
 *
 * Example: "Task A is subtask of Task B"
 */
export interface RelationshipPattern {
  /** Pattern name (e.g., 'subtask_of', 'reminder_for') */
  name: string;

  /** Regex pattern to match relationship text */
  pattern: RegExp;

  /** Entity type for the subject */
  subjectEntity: string;

  /** Entity type for the object */
  objectEntity: string;

  /** Foreign key field on subject pointing to object */
  foreignKey: string;

  /** Optional: use this field for lookup instead of title */
  subjectLookupField?: string;
  objectLookupField?: string;
}

// =============================================================================
// Diagnostics Configuration
// =============================================================================

/**
 * Tmux log provider configuration.
 */
export interface TmuxDiagnosticsConfig {
  /** Tmux session name to capture logs from */
  sessionName: string;

  /** Number of lines to capture (default: 100) */
  lines?: number;

  /** Only capture logs after step start time (default: true) */
  filterByTime?: boolean;

  /** Clear tmux buffer before each scenario (default: false) */
  clearBeforeScenario?: boolean;
}

/**
 * Generic traces provider configuration.
 *
 * Use this with any TracesProvider implementation (Tempo, LangFuse, Jaeger, etc.)
 *
 * @example
 * ```typescript
 * import { createTempoProvider } from '@agent-qa/traces-tempo';
 *
 * diagnostics: {
 *   traces: {
 *     provider: createTempoProvider({ url: 'http://localhost:3200' })
 *   }
 * }
 * ```
 */
export interface TracesDiagnosticsConfig {
  /**
   * The traces provider instance.
   * Import from @agent-qa/traces-tempo or implement your own TracesProvider.
   */
  provider: unknown; // TracesProvider - typed as unknown to avoid circular imports

  /** Whether to include span details in reports (default: true) */
  includeSpans?: boolean;
}

/**
 * Docker log provider configuration.
 */
export interface DockerDiagnosticsConfig {
  /** Container name or ID */
  container: string;

  /** Number of lines to capture (default: 100) */
  lines?: number;

  /** Only capture logs after step start time (default: true) */
  filterByTime?: boolean;
}

/**
 * File log provider configuration.
 */
export interface FileDiagnosticsConfig {
  /** Path to the log file */
  path: string;

  /** Number of lines to read from end (default: 100) */
  lines?: number;

  /** Display title (default: filename) */
  title?: string;
}

/**
 * Custom diagnostics provider interface (for array format).
 */
export interface DiagnosticsProviderConfig {
  name: string;
  collect(context: unknown): Promise<{ type: string; title: string; content: string; raw?: unknown } | null>;
  cleanup?(): Promise<void>;
}

/**
 * Declarative diagnostics configuration.
 */
export interface DiagnosticsConfigObject {
  /** Tmux log provider */
  tmux?: TmuxDiagnosticsConfig;

  /**
   * Generic traces provider.
   * Works with any TracesProvider implementation (Tempo, LangFuse, Jaeger, etc.)
   *
   * @example
   * ```typescript
   * import { createTempoProvider } from '@agent-qa/traces-tempo';
   *
   * diagnostics: {
   *   traces: { provider: createTempoProvider({ url: 'http://localhost:3200' }) }
   * }
   * ```
   */
  traces?: TracesDiagnosticsConfig;

  /** Docker log provider */
  docker?: DockerDiagnosticsConfig;

  /** File log provider */
  file?: FileDiagnosticsConfig;

  /** Custom providers */
  custom?: DiagnosticsProviderConfig[];

  /** Max lines to display in console output (default: 5000) */
  maxDiagnosticLines?: number;

  /** Directory to save markdown diagnostic reports (optional) */
  outputDir?: string;
}

/**
 * Diagnostics configuration (supports hybrid format).
 *
 * Object format: Declarative built-in providers
 * Array format: Custom provider instances
 */
export type DiagnosticsConfig = DiagnosticsConfigObject | DiagnosticsProviderConfig[];

// =============================================================================
// Reporter Configuration
// =============================================================================

/**
 * Markdown reporter configuration.
 */
export interface MarkdownReporterConfig {
  type: 'markdown';

  /** Output directory for report files */
  path: string;

  /** Filename template (supports {id}, {scenario}, {timestamp}, {status}) */
  filename?: string;

  /** Only generate reports for failed scenarios (default: false) */
  onlyOnFailure?: boolean;

  /** Include diagnostics data in reports (default: true) */
  includeDiagnostics?: boolean;

  /** Include tool call details (default: true) */
  includeToolCalls?: boolean;

  /** Include captured entities (default: true) */
  includeEntities?: boolean;
}

/**
 * Reporter configuration.
 */
export type ReporterConfig =
  | 'console'
  | 'json'
  | 'markdown'
  | { type: 'console'; verbose?: boolean; showCosts?: boolean; showUsage?: boolean }
  | { type: 'json'; outputPath?: string }
  | MarkdownReporterConfig;

/**
 * Advanced reports configuration (alternative to reporters array).
 */
export interface ReportsConfig {
  /** Console reporter */
  console?: boolean | { verbose?: boolean; showCosts?: boolean; showUsage?: boolean };

  /** JSON reporter */
  json?: boolean | { path: string };

  /** Markdown reporter */
  markdown?: boolean | {
    path: string;
    filename?: string;
    onlyOnFailure?: boolean;
    includeDiagnostics?: boolean;
    includeToolCalls?: boolean;
    includeEntities?: boolean;
  };
}

// =============================================================================
// Main Configuration
// =============================================================================

/**
 * Main Agent QA framework configuration.
 *
 * Products define this in agent-qa.config.ts at their root.
 */
export interface AgentQAConfig {
  /** Product name (for reports and logs) */
  name: string;

  /** Agent configuration */
  agent: AgentConfig;

  /**
   * Database configuration (optional).
   * When null/undefined, a NullDatabaseAdapter is used which throws
   * descriptive errors if entity assertions are attempted.
   */
  database?: DatabaseConfig;

  /** Vector store configuration (optional) */
  vectorStore?: VectorStoreConfig;

  /**
   * Global setup file path (like Vitest's globalSetup).
   *
   * The file should export a setup() function that optionally returns a teardown function.
   *
   * @example
   * ```typescript
   * // agentqa.setup.ts
   * import { tmuxProcess, waitForHealth } from '@agent-qa/core/helpers';
   *
   * export async function setup() {
   *   const api = await tmuxProcess.start({
   *     name: 'api',
   *     command: 'pnpm dev',
   *     port: 4000,
   *   });
   *
   *   await waitForHealth('http://localhost:4000/health');
   *
   *   return async () => {
   *     await api.stop();
   *   };
   * }
   * ```
   */
  globalSetup?: string;

  /**
   * Lifecycle hooks for test execution.
   *
   * @example
   * ```typescript
   * hooks: {
   *   beforeEach: async (scenario) => {
   *     await db.delete(tasks).where(eq(tasks.userId, testUserId));
   *   },
   *   afterEach: async (scenario, result) => {
   *     if (!result.passed) {
   *       console.log('Failed:', scenario.id);
   *     }
   *   },
   * }
   * ```
   */
  hooks?: LifecycleHooks;

  /** Setup configuration (optional) */
  setup?: SetupConfig;

  /** Relationship patterns for semantic assertions */
  relationships?: RelationshipPattern[];

  /**
   * Diagnostics configuration for failure debugging.
   *
   * Supports two formats:
   * - Object: Declarative built-in providers { tmux: {...}, tempo: {...} }
   * - Array: Custom provider instances [myProvider]
   */
  diagnostics?: DiagnosticsConfig;

  /** Default user ID (supports $ENV_VAR syntax) */
  defaultUserId?: string;

  /** Reporters (default: ['console']) */
  reporters?: ReporterConfig[];

  /**
   * Advanced reports configuration (alternative to reporters array).
   * Use this for more control over individual reporter options.
   */
  reports?: ReportsConfig;

  /** Verbose output */
  verbose?: boolean;

  /** Stop on first failure */
  stopOnFailure?: boolean;

  /** Default step timeout in milliseconds (default: 60000) */
  defaultTimeout?: number;
}

// =============================================================================
// Resolved Configuration (after env var resolution)
// =============================================================================

/**
 * Resolved agent configuration (env vars replaced with values).
 */
export interface ResolvedAgentConfig {
  baseUrl: string;
  token: string;
  chatEndpoint: string;
  headers: Record<string, string>;
  timeout: number;
  retries: number;
  retryDelay: number;
  retryOn: number[];
}

/**
 * Resolved database configuration.
 */
export interface ResolvedDatabaseConfig {
  url: string;
  entities: EntityConfig[];
  defaultUserIdColumn: string;
}

/**
 * Resolved vector store configuration.
 */
export interface ResolvedVectorStoreConfig {
  type: 'milvus';
  host: string;
  port: number;
  verbose: boolean;
}

/**
 * Fully resolved configuration ready for use.
 */
export interface ResolvedConfig {
  name: string;
  agent: ResolvedAgentConfig;
  database: ResolvedDatabaseConfig | null;  // null when database not configured
  vectorStore?: ResolvedVectorStoreConfig;
  globalSetup?: string;
  hooks?: LifecycleHooks;
  setup: SetupConfig;
  relationships: RelationshipPattern[];
  diagnostics?: DiagnosticsConfig;
  reports?: ReportsConfig;
  defaultUserId: string;
  reporters: ReporterConfig[];
  verbose: boolean;
  stopOnFailure: boolean;
  defaultTimeout: number;
}
