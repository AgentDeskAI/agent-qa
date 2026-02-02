/**
 * Health Utilities
 *
 * Wait for ports and health endpoints.
 */

import net from 'node:net';

import {
  DEFAULT_HEALTH_TIMEOUT_MS,
  DEFAULT_PORT_CHECK_INTERVAL_MS,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_SOCKET_TIMEOUT_MS,
} from '../constants.js';

/**
 * Options for waiting for a port.
 */
export interface WaitForPortOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Interval between checks in milliseconds (default: 500) */
  interval?: number;

  /** Host to check (default: 'localhost') */
  host?: string;
}

/**
 * Options for waiting for a health endpoint.
 */
export interface WaitForHealthOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Interval between checks in milliseconds (default: 1000) */
  interval?: number;

  /** Expected status code (default: any 2xx) */
  expectedStatus?: number;

  /** HTTP method (default: 'GET') */
  method?: 'GET' | 'HEAD';

  /** Headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Check if a port is open.
 */
async function checkPort(port: number, host = 'localhost'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(DEFAULT_SOCKET_TIMEOUT_MS);

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
 * Wait for a port to be open.
 *
 * @param port - Port number to wait for
 * @param options - Configuration options
 * @returns Promise that resolves when port is open, rejects on timeout
 *
 * @example
 * ```typescript
 * // Wait for API to start
 * await waitForPort(4000);
 *
 * // With custom timeout
 * await waitForPort(5432, { timeout: 60000 });
 * ```
 */
export async function waitForPort(
  port: number,
  options: WaitForPortOptions = {}
): Promise<void> {
  const { timeout = DEFAULT_HEALTH_TIMEOUT_MS, interval = DEFAULT_PORT_CHECK_INTERVAL_MS, host = 'localhost' } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await checkPort(port, host)) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`Timeout waiting for port ${port} on ${host}`);
}

/**
 * Wait for a health endpoint to respond.
 *
 * @param url - Health check URL
 * @param options - Configuration options
 * @returns Promise that resolves when health check passes, rejects on timeout
 *
 * @example
 * ```typescript
 * // Wait for API health
 * await waitForHealth('http://localhost:4000/health');
 *
 * // With custom timeout
 * await waitForHealth('http://localhost:4000/health', { timeout: 60000 });
 *
 * // With auth header
 * await waitForHealth('http://localhost:4000/health', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 * ```
 */
export async function waitForHealth(
  url: string,
  options: WaitForHealthOptions = {}
): Promise<void> {
  const {
    timeout = DEFAULT_HEALTH_TIMEOUT_MS,
    interval = DEFAULT_HEALTH_CHECK_INTERVAL_MS,
    expectedStatus,
    method = 'GET',
    headers,
  } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, { method, headers });

      if (expectedStatus !== undefined) {
        if (response.status === expectedStatus) {
          return;
        }
      } else if (response.ok) {
        return;
      }
    } catch {
      // Not ready yet
    }

    await sleep(interval);
  }

  throw new Error(`Timeout waiting for health check at ${url}`);
}

/**
 * Check if a health endpoint is responding.
 *
 * @param url - Health check URL
 * @param options - Configuration options
 * @returns Promise that resolves to true if healthy, false otherwise
 *
 * @example
 * ```typescript
 * const isHealthy = await checkHealth('http://localhost:4000/health');
 * if (isHealthy) {
 *   console.log('API is up!');
 * }
 * ```
 */
export async function checkHealth(
  url: string,
  options: Pick<WaitForHealthOptions, 'expectedStatus' | 'method' | 'headers'> = {}
): Promise<boolean> {
  const { expectedStatus, method = 'GET', headers } = options;

  try {
    const response = await fetch(url, { method, headers });

    if (expectedStatus !== undefined) {
      return response.status === expectedStatus;
    }

    return response.ok;
  } catch {
    return false;
  }
}

// Re-export sleep from shared utils
import { sleep } from './utils.js';
export { sleep };
