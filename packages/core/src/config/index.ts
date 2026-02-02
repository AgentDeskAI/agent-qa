/**
 * Config Module
 *
 * Configuration system for @agent-qa/core.
 */

export type {
  AgentQAConfig,
  ResolvedConfig,
  EntityConfig,
  AgentConfig,
  DatabaseConfig,
  DrizzleDatabaseConfig,
  CustomDatabaseConfig,
  SetupConfig,
  ProcessResult,
  RelationshipPattern,
  ReporterConfig,
  ResolvedAgentConfig,
  ResolvedDatabaseConfig,
  // Lifecycle hooks
  LifecycleHooks,
  HookContext,
  ScenarioInfo,
  ScenarioResultInfo,
  // Diagnostics config types
  DiagnosticsConfig,
  DiagnosticsConfigObject,
  TmuxDiagnosticsConfig,
  TracesDiagnosticsConfig,
  DockerDiagnosticsConfig,
  FileDiagnosticsConfig,
  DiagnosticsProviderConfig,
  // Reporter config types
  ReportsConfig,
  MarkdownReporterConfig,
} from './types.js';

export {
  isCustomDatabaseConfig,
  isDrizzleDatabaseConfig,
} from './types.js';

export { defineConfig } from './define-config.js';

export {
  resolveEnvVar,
  resolveEnvVarOptional,
  resolveConfig,
  validateConfig,
  getDiagnosticsMaxLines,
  getDiagnosticsOutputDir,
  hasCustomDatabaseAdapter,
  getCustomDatabaseAdapter,
} from './resolver.js';

export {
  findConfigFile,
  loadConfigFile,
  loadConfig,
  loadConfigWithRaw,
  hasConfigFile,
  getConfigDir,
} from './loader.js';

export type { LoadConfigResult } from './loader.js';
