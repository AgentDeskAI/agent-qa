/**
 * Infrastructure Helpers
 *
 * Importable utilities for infrastructure management.
 * Use these in globalSetup files to start/stop infrastructure.
 *
 * @example
 * ```typescript
 * // agentqa.setup.ts
 * import {
 *   dockerPostgres,
 *   tmuxProcess,
 *   dockerCompose,
 *   frpTunnel,
 *   waitForPort,
 *   waitForHealth,
 * } from '@agent-qa/core/helpers';
 *
 * export async function setup() {
 *   // Start database
 *   const db = await dockerPostgres.start({ port: 5438 });
 *
 *   // Start API in tmux
 *   const api = await tmuxProcess.start({
 *     name: 'my-api',
 *     command: 'pnpm dev',
 *     port: 4000,
 *   });
 *
 *   // Wait for API to be ready
 *   await waitForHealth('http://localhost:4000/health');
 *
 *   // Return teardown function
 *   return async () => {
 *     await api.stop();
 *     await db.stop();
 *   };
 * }
 * ```
 */

// Types
export type {
  Instance,
  InstanceInfo,
  DockerPostgresOptions,
  PostgresInstance,
  TmuxProcessOptions,
  TmuxInstance,
  DockerComposeOptions,
  ComposeInstance,
  FrpTunnelOptions,
  TunnelInstance,
} from './types.js';

// Docker PostgreSQL
export { dockerPostgres } from './docker-postgres.js';

// Tmux process management
export { tmuxProcess } from './tmux-process.js';

// Docker Compose
export { dockerCompose } from './docker-compose.js';

// FRP Tunnel
export { frpTunnel } from './frp-tunnel.js';

// Health/Port utilities
export type { WaitForPortOptions, WaitForHealthOptions } from './health.js';
export { waitForPort, waitForHealth, checkHealth } from './health.js';

// Shared utilities
export {
  sleep,
  validateIdentifier,
  validatePath,
  validatePort,
  escapeShellArg,
  quotePath,
} from './utils.js';
