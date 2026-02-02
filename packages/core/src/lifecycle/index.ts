/**
 * Lifecycle Module
 *
 * Infrastructure lifecycle management for agent-qa.
 *
 * The lifecycle system uses a Vitest-like pattern where users define
 * a globalSetup file that exports a setup() function. This function
 * can optionally return a teardown function.
 *
 * @example
 * ```typescript
 * // agentqa.config.ts
 * export default defineConfig({
 *   globalSetup: './agentqa.setup.ts',
 *   hooks: {
 *     beforeEach: async (scenario) => { ... },
 *     afterEach: async (scenario, result) => { ... },
 *   },
 * });
 * ```
 *
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

// Preflight checks
export type { PreflightOptions, PreflightResult } from './preflight.js';
export { quickPreflightCheck } from './preflight.js';

// Global setup loader
export type { TeardownFn, GlobalSetupModule, GlobalSetupOptions } from './global-setup.js';
export { runGlobalSetup, runTeardown } from './global-setup.js';
