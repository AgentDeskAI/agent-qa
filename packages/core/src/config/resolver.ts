/**
 * Config Resolver
 *
 * Resolves environment variables ($VAR syntax) in configuration values.
 */

import {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RETRYABLE_STATUS_CODES,
  DEFAULT_USER_ID,
  DEFAULT_USER_ID_COLUMN,
  DEFAULT_REPORTERS,
  DEFAULT_CHAT_ENDPOINT,
} from '../constants.js';
import type {
  AgentQAConfig,
  ResolvedConfig,
  ResolvedAgentConfig,
  ResolvedDatabaseConfig,
  ResolvedVectorStoreConfig,
  VectorStoreConfig,
  DiagnosticsConfig,
  DiagnosticsConfigObject,
  DatabaseConfig,
} from './types.js';
import { isCustomDatabaseConfig } from './types.js';

/**
 * Resolve a string value that may contain $ENV_VAR references.
 *
 * @example
 * resolveEnvVar('$API_URL')  // Returns process.env.API_URL
 * resolveEnvVar('http://localhost:4000')  // Returns as-is
 */
export function resolveEnvVar(value: string): string {
  if (!value.startsWith('$')) {
    return value;
  }

  const envName = value.slice(1);
  const envValue = process.env[envName];

  if (envValue === undefined) {
    throw new Error(`Environment variable ${envName} is not set (referenced as ${value})`);
  }

  return envValue;
}

/**
 * Resolve a string value, returning undefined if the env var is not set.
 */
export function resolveEnvVarOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value.startsWith('$')) {
    return value;
  }

  const envName = value.slice(1);
  return process.env[envName];
}

/**
 * Resolve headers, replacing $VAR references.
 */
function resolveHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveEnvVar(value);
  }
  return resolved;
}

/**
 * Resolve agent configuration.
 */
function resolveAgentConfig(config: AgentQAConfig['agent']): ResolvedAgentConfig {
  return {
    baseUrl: resolveEnvVar(config.baseUrl),
    token: resolveEnvVar(config.token),
    chatEndpoint: config.chatEndpoint ?? DEFAULT_CHAT_ENDPOINT,
    headers: resolveHeaders(config.headers),
    timeout: config.timeout ?? DEFAULT_HTTP_TIMEOUT_MS,
    retries: config.retries ?? DEFAULT_RETRY_COUNT,
    retryDelay: config.retryDelay ?? DEFAULT_RETRY_DELAY_MS,
    retryOn: config.retryOn ?? [...DEFAULT_RETRYABLE_STATUS_CODES],
  };
}

/**
 * Resolve database configuration.
 * Returns null if database is not configured (for in-memory or database-less testing).
 * Custom adapters are passed through without modification.
 */
function resolveDatabaseConfig(
  config: DatabaseConfig | undefined,
): ResolvedDatabaseConfig | null {
  if (!config) return null;

  // Custom adapter - don't resolve, just return a marker
  // The actual adapter is accessed via getCustomDatabaseAdapter()
  if (isCustomDatabaseConfig(config)) {
    // Return a special marker indicating custom adapter is in use
    // The entities array is empty since the adapter handles everything
    return {
      url: '__CUSTOM_ADAPTER__',
      entities: [],
      defaultUserIdColumn: DEFAULT_USER_ID_COLUMN,
    };
  }

  return {
    url: resolveEnvVar(config.url),
    entities: config.entities,
    defaultUserIdColumn: config.defaultUserIdColumn ?? DEFAULT_USER_ID_COLUMN,
  };
}

/**
 * Check if the original config has a custom database adapter.
 */
export function hasCustomDatabaseAdapter(config: AgentQAConfig): boolean {
  return config.database !== undefined && isCustomDatabaseConfig(config.database);
}

/**
 * Get the custom database adapter from config.
 * Throws if the config doesn't have a custom adapter.
 */
export function getCustomDatabaseAdapter(config: AgentQAConfig): unknown {
  if (!config.database || !isCustomDatabaseConfig(config.database)) {
    throw new Error('Config does not have a custom database adapter');
  }
  return config.database.adapter;
}

/**
 * Resolve vector store configuration.
 */
function resolveVectorStoreConfig(
  config: VectorStoreConfig | undefined,
): ResolvedVectorStoreConfig | undefined {
  if (!config) return undefined;

  const portValue = config.port;
  let port = 19530; // Milvus default

  if (typeof portValue === 'string') {
    if (portValue.startsWith('$')) {
      const envValue = resolveEnvVarOptional(portValue);
      port = envValue ? parseInt(envValue, 10) : 19530;
    } else {
      port = parseInt(portValue, 10);
    }
  } else if (typeof portValue === 'number') {
    port = portValue;
  }

  return {
    type: config.type,
    host: config.host ?? 'localhost',
    port,
    verbose: config.verbose ?? false,
  };
}

/**
 * Resolve the full configuration, replacing all $ENV_VAR references.
 */
export function resolveConfig(config: AgentQAConfig): ResolvedConfig {
  return {
    name: config.name,
    agent: resolveAgentConfig(config.agent),
    database: resolveDatabaseConfig(config.database),
    vectorStore: resolveVectorStoreConfig(config.vectorStore),
    globalSetup: config.globalSetup,
    hooks: config.hooks,
    setup: config.setup ?? {},
    relationships: config.relationships ?? [],
    diagnostics: config.diagnostics,
    reports: config.reports,
    defaultUserId: config.defaultUserId ? resolveEnvVar(config.defaultUserId) : DEFAULT_USER_ID,
    reporters: config.reporters ?? [...DEFAULT_REPORTERS],
    verbose: config.verbose ?? false,
    stopOnFailure: config.stopOnFailure ?? false,
    defaultTimeout: config.defaultTimeout ?? DEFAULT_HTTP_TIMEOUT_MS,
  };
}

/**
 * Validate that required configuration is present.
 */
export function validateConfig(config: AgentQAConfig): void {
  if (!config.name) {
    throw new Error('Config error: "name" is required');
  }

  if (!config.agent) {
    throw new Error('Config error: "agent" section is required');
  }

  if (!config.agent.baseUrl) {
    throw new Error('Config error: "agent.baseUrl" is required');
  }

  if (!config.agent.token) {
    throw new Error('Config error: "agent.token" is required');
  }

  // Database is optional - allows in-memory or database-less testing
  if (config.database) {
    // Custom adapter - just verify adapter is present
    if (isCustomDatabaseConfig(config.database)) {
      if (!config.database.adapter) {
        throw new Error('Config error: "database.adapter" is required when using custom adapter');
      }
      // Custom adapters handle their own validation
      return;
    }

    // Drizzle config - validate url and entities
    if (!config.database.url) {
      throw new Error('Config error: "database.url" is required when database is configured');
    }

    if (!config.database.entities || config.database.entities.length === 0) {
      throw new Error(
        'Config error: "database.entities" must have at least one entity when database is configured',
      );
    }

    // Validate each entity
    for (const entity of config.database.entities) {
      if (!entity.name) {
        throw new Error('Config error: Each entity must have a "name"');
      }
      if (!entity.table) {
        throw new Error(`Config error: Entity "${entity.name}" must have a "table"`);
      }
    }
  }
}

/**
 * Check if a diagnostics config is an object config (not an array of providers).
 */
function isDiagnosticsConfigObject(config: DiagnosticsConfig | undefined): config is DiagnosticsConfigObject {
  return config !== undefined && !Array.isArray(config);
}

/**
 * Get maxDiagnosticLines from diagnostics config.
 * Returns undefined if not configured (callers use default).
 */
export function getDiagnosticsMaxLines(config: DiagnosticsConfig | undefined): number | undefined {
  if (isDiagnosticsConfigObject(config)) {
    return config.maxDiagnosticLines;
  }
  return undefined;
}

/**
 * Get outputDir from diagnostics config.
 * Returns undefined if not configured.
 */
export function getDiagnosticsOutputDir(config: DiagnosticsConfig | undefined): string | undefined {
  if (isDiagnosticsConfigObject(config)) {
    return config.outputDir;
  }
  return undefined;
}
