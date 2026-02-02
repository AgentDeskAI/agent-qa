#!/usr/bin/env node
/**
 * agent-qa CLI
 *
 * Entry point for the agent-qa command-line interface.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

import { getConfigDir } from '../src/config/loader.js';
import { runCli } from '../src/cli/index.js';

/**
 * Env file names to search for (in order of priority).
 */
const ENV_FILE_NAMES = ['.env', '.env.local'];

/**
 * Get the agent-qa package root directory.
 */
function getPackageDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  // Compiled: dist/bin/agent-qa.js -> dist/bin -> dist -> package root
  // Source: bin/agent-qa.ts -> bin -> package root
  // We need to check if we're in dist/bin or bin
  const binDir = dirname(currentFile);
  const parentDir = dirname(binDir);
  const parentName = parentDir.split('/').pop();

  if (parentName === 'dist') {
    // Running from dist/bin, go up one more level
    return dirname(parentDir);
  }
  // Running from bin (source)
  return parentDir;
}

/**
 * Search up the directory tree for an env file.
 * Similar to how git searches for .git directory.
 */
function findEnvFile(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    for (const fileName of ENV_FILE_NAMES) {
      const envPath = join(currentDir, fileName);
      if (existsSync(envPath)) {
        return envPath;
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      return null;
    }
    currentDir = parentDir;
  }
}

/**
 * Load .env file with the following priority:
 * 1. agent-qa package directory (canonical location)
 * 2. Config directory (where agentqa.config.ts lives)
 * 3. Search up from current directory
 * 4. Current working directory (default dotenv behavior)
 */
function loadEnvFile(): void {
  // Priority 1: Load from agent-qa package directory
  const packageDir = getPackageDir();
  for (const fileName of ENV_FILE_NAMES) {
    const packageEnvPath = join(packageDir, fileName);
    if (existsSync(packageEnvPath)) {
      config({ path: packageEnvPath });
      return;
    }
  }

  // Priority 2: Load from agentqa config directory
  const configDir = getConfigDir();
  if (configDir) {
    for (const fileName of ENV_FILE_NAMES) {
      const configEnvPath = join(configDir, fileName);
      if (existsSync(configEnvPath)) {
        config({ path: configEnvPath });
        return;
      }
    }
  }

  // Priority 3: Search up from cwd for .env or .env.local
  const foundEnvPath = findEnvFile(process.cwd());
  if (foundEnvPath) {
    config({ path: foundEnvPath });
    return;
  }

  // Priority 4: Default dotenv behavior (cwd)
  config();
}

loadEnvFile();
runCli();
