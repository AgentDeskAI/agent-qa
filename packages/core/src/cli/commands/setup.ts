/**
 * Setup Command
 *
 * Start infrastructure using globalSetup file.
 *
 * This command runs the globalSetup from your agentqa.config.ts and
 * keeps infrastructure running. Teardown function is NOT called, so
 * infrastructure remains available for manual testing or development.
 */

import { resolve } from 'node:path';

import type { Command } from 'commander';

import { loadConfig } from '../../config/index.js';
import { runGlobalSetup } from '../../lifecycle/index.js';
import * as output from '../utils/output.js';

/**
 * Setup command options.
 */
interface SetupOptions {
  verbose?: boolean;
  config?: string;
}

/**
 * Register the setup command.
 */
export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Start infrastructure using globalSetup (keeps running after command exits)')
    .option('-v, --verbose', 'Verbose output')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options: SetupOptions) => {
      await setupCommand(options);
    });
}

/**
 * Execute the setup command.
 */
async function setupCommand(options: SetupOptions): Promise<void> {
  try {
    // Load config (loadConfig already resolves env vars)
    const configPath = options.config ? resolve(options.config) : undefined;
    const config = await loadConfig(configPath);

    if (!config.globalSetup) {
      output.warning('No globalSetup configured in agentqa.config.ts');
      output.info('');
      output.info('Add a globalSetup file to your config:');
      output.info('');
      console.log('  // agentqa.config.ts');
      console.log('  export default defineConfig({');
      console.log('    globalSetup: "./agentqa.setup.ts",');
      console.log('    // ...');
      console.log('  });');
      output.info('');
      output.info('Then create the setup file:');
      output.info('');
      console.log('  // agentqa.setup.ts');
      console.log('  import { tmuxProcess, waitForHealth } from "@agent-qa/core/helpers";');
      console.log('  ');
      console.log('  export async function setup() {');
      console.log('    const api = await tmuxProcess.start({');
      console.log('      name: "api",');
      console.log('      command: "pnpm dev",');
      console.log('      port: 4000,');
      console.log('    });');
      console.log('    await waitForHealth("http://localhost:4000/health");');
      console.log('    return async () => { await api.stop(); };');
      console.log('  }');
      output.info('');
      return;
    }

    output.header('Starting Infrastructure');
    output.info(`Using globalSetup: ${config.globalSetup}`);
    console.log('');

    // Run global setup (but don't save teardown - we want infra to stay running)
    const teardown = await runGlobalSetup(config.globalSetup, {
      cwd: process.cwd(),
      verbose: options.verbose,
    });

    console.log('');
    output.success('Infrastructure started');

    if (teardown) {
      output.info('');
      output.info('Infrastructure will remain running.');
      output.info('Run "agentqa teardown" or kill processes manually when done.');
    }
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}
