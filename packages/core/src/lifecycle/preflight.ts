/**
 * Preflight Check Module
 *
 * Quick infrastructure validation before tests.
 */

import net from 'node:net';

import type { ResolvedConfig } from '../config/types.js';

/**
 * Check if a port is listening.
 */
async function isPortOpen(port: number, host = 'localhost'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 2000;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Preflight check options.
 */
export interface PreflightOptions {
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Preflight check result.
 */
export interface PreflightResult {
  /** Whether all checks passed */
  success: boolean;

  /** List of issues found */
  issues: string[];
}

/**
 * Quick check if essential infrastructure is available.
 *
 * This performs simple port checks to verify the API and optionally
 * the database are reachable.
 *
 * @param config - Resolved configuration
 * @param options - Check options
 * @returns Result with success status and any issues found
 *
 * @example
 * ```typescript
 * const result = await quickPreflightCheck(config, { verbose: true });
 * if (!result.success) {
 *   console.error('Infrastructure not ready:', result.issues);
 *   process.exit(1);
 * }
 * ```
 */
export async function quickPreflightCheck(
  config: ResolvedConfig,
  options: PreflightOptions = {}
): Promise<PreflightResult> {
  const { verbose = false } = options;
  const issues: string[] = [];

  // Check API endpoint
  if (config.agent.baseUrl) {
    try {
      const url = new URL(config.agent.baseUrl);
      const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
      const isOpen = await isPortOpen(port, url.hostname);

      if (!isOpen) {
        issues.push(`API server not responding on ${config.agent.baseUrl}`);
      } else if (verbose) {
        console.log(`  ✓ API server: ${config.agent.baseUrl}`);
      }
    } catch {
      issues.push(`Invalid API URL: ${config.agent.baseUrl}`);
    }
  }

  // Check database if configured
  if (config.database?.url) {
    try {
      const url = new URL(config.database.url);
      const port = parseInt(url.port) || 5432;
      const isOpen = await isPortOpen(port, url.hostname);

      if (!isOpen) {
        issues.push(`Database not responding on port ${port}`);
      } else if (verbose) {
        console.log(`  ✓ Database: port ${port}`);
      }
    } catch {
      // URL parsing failed, skip check
    }
  }

  return {
    success: issues.length === 0,
    issues,
  };
}
