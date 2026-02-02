/**
 * Global Setup Loader
 *
 * Load and execute globalSetup files (Vitest-like pattern).
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Teardown function type.
 */
export type TeardownFn = () => Promise<void>;

/**
 * Global setup module interface.
 */
export interface GlobalSetupModule {
  /** Main setup function (required) */
  setup?: () => Promise<void | TeardownFn>;

  /** Explicit teardown function (alternative to returning from setup) */
  teardown?: TeardownFn;
}

/**
 * Options for running global setup.
 */
export interface GlobalSetupOptions {
  /** Working directory for resolving relative paths (default: cwd) */
  cwd?: string;

  /** Verbose output */
  verbose?: boolean;
}

/**
 * Run a global setup file.
 *
 * The setup file should export a `setup()` function that optionally returns a
 * teardown function. Alternatively, it can export a separate `teardown()` function.
 *
 * @param setupPath - Path to the setup file (relative to cwd or absolute)
 * @param options - Configuration options
 * @returns Teardown function if provided, undefined otherwise
 *
 * @example
 * ```typescript
 * // In your setup file (agentqa.setup.ts):
 * export async function setup() {
 *   const api = await startApi();
 *
 *   // Return teardown function
 *   return async () => {
 *     await api.stop();
 *   };
 * }
 *
 * // Or use separate teardown:
 * export async function setup() {
 *   await startApi();
 * }
 *
 * export async function teardown() {
 *   await stopApi();
 * }
 * ```
 */
export async function runGlobalSetup(
  setupPath: string,
  options: GlobalSetupOptions = {}
): Promise<TeardownFn | undefined> {
  const { cwd = process.cwd(), verbose = false } = options;

  // Resolve the path
  const absolutePath = resolve(cwd, setupPath);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    throw new Error(`globalSetup file not found: ${absolutePath}`);
  }

  if (verbose) {
    console.log(`Loading globalSetup: ${absolutePath}`);
  }

  // Import the module
  const moduleUrl = pathToFileURL(absolutePath).href;
  const module = (await import(moduleUrl)) as GlobalSetupModule;

  // Validate the module exports setup function
  if (typeof module.setup !== 'function') {
    throw new Error(
      `globalSetup file must export a setup() function: ${setupPath}\n` +
      `Example:\n` +
      `  export async function setup() {\n` +
      `    // Start your infrastructure\n` +
      `    return async () => { /* teardown */ };\n` +
      `  }`
    );
  }

  if (verbose) {
    console.log('Running globalSetup...');
  }

  // Run setup
  const result = await module.setup();

  // Determine teardown function
  if (typeof result === 'function') {
    if (verbose) {
      console.log('globalSetup complete (teardown function returned)');
    }
    return result;
  }

  // Check for explicit teardown export
  if (typeof module.teardown === 'function') {
    if (verbose) {
      console.log('globalSetup complete (teardown function exported)');
    }
    return module.teardown;
  }

  if (verbose) {
    console.log('globalSetup complete (no teardown)');
  }

  return undefined;
}

/**
 * Run a teardown function with error handling.
 *
 * @param teardown - Teardown function to run
 * @param options - Configuration options
 */
export async function runTeardown(
  teardown: TeardownFn | undefined,
  options: { verbose?: boolean } = {}
): Promise<void> {
  if (!teardown) return;

  const { verbose = false } = options;

  if (verbose) {
    console.log('Running teardown...');
  }

  try {
    await teardown();
    if (verbose) {
      console.log('Teardown complete');
    }
  } catch (error) {
    console.error('Teardown failed:', error instanceof Error ? error.message : String(error));
    // Don't rethrow - we want tests to report success/failure, not teardown issues
  }
}
