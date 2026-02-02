/**
 * Config Loader
 *
 * Discovers and loads agent-qa.config.ts files.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveConfig, validateConfig } from './resolver.js';
import type { AgentQAConfig, ResolvedConfig } from './types.js';

/**
 * Config file names to search for (in order of priority).
 */
const CONFIG_FILE_NAMES = [
  'agentqa.config.ts',
  'agentqa.config.js',
  'agentqa.config.mjs',
  // Legacy names (deprecated)
  'agent-qa.config.ts',
  'agent-qa.config.js',
  'agent-qa.config.mjs',
];

/**
 * Find the config file by searching from cwd up to root.
 */
export function findConfigFile(startDir?: string): string | null {
  let currentDir = startDir ?? process.cwd();

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = join(currentDir, fileName);
      if (existsSync(filePath)) {
        return filePath;
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root
      return null;
    }
    currentDir = parentDir;
  }
}

/**
 * Load a config file and return the raw config.
 */
export async function loadConfigFile(configPath: string): Promise<AgentQAConfig> {
  const absolutePath = resolve(configPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  // Use dynamic import with file URL for ESM compatibility
  const fileUrl = pathToFileURL(absolutePath).href;

  try {
    const module = await import(fileUrl);
    const config = module.default as AgentQAConfig;

    if (!config) {
      throw new Error(`Config file must have a default export: ${absolutePath}`);
    }

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config file ${absolutePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Result of loading config with both raw and resolved versions.
 */
export interface LoadConfigResult {
  /** Resolved config with environment variables replaced */
  resolved: ResolvedConfig;
  /** Raw config as written in the config file */
  raw: AgentQAConfig;
}

/**
 * Load and resolve the config.
 *
 * @param configPath - Optional path to config file. If not provided, searches from cwd.
 */
export async function loadConfig(configPath?: string): Promise<ResolvedConfig> {
  const result = await loadConfigWithRaw(configPath);
  return result.resolved;
}

/**
 * Load config and return both raw and resolved versions.
 * Use this when you need access to the raw config (e.g., for custom adapters).
 *
 * @param configPath - Optional path to config file. If not provided, searches from cwd.
 */
export async function loadConfigWithRaw(configPath?: string): Promise<LoadConfigResult> {
  const path = configPath ?? findConfigFile();

  if (!path) {
    throw new Error(
      'No agentqa.config.ts found. Create one in your project root or specify --config path.'
    );
  }

  const rawConfig = await loadConfigFile(path);

  // Validate before resolving
  validateConfig(rawConfig);

  // Resolve environment variables
  return {
    resolved: resolveConfig(rawConfig),
    raw: rawConfig,
  };
}

/**
 * Check if a config file exists in the current directory tree.
 */
export function hasConfigFile(startDir?: string): boolean {
  return findConfigFile(startDir) !== null;
}

/**
 * Get the directory containing the config file.
 */
export function getConfigDir(startDir?: string): string | null {
  const configPath = findConfigFile(startDir);
  return configPath ? dirname(configPath) : null;
}
