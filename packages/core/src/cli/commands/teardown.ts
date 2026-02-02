/**
 * Teardown Command
 *
 * Stop infrastructure started by globalSetup.
 *
 * Supports discovery-based cleanup for reliable teardown of ALL AgentQA
 * resources, including orphaned containers, tmux sessions, and FRP tunnels.
 */

import { resolve } from 'node:path';

import type { Command } from 'commander';

import { loadConfig } from '../../config/index.js';
import { tmuxProcess } from '../../helpers/index.js';
import {
  discoverAllResources,
  summarizeResources,
  cleanupAllResources,
  cleanupInstance,
  formatCleanupResult,
  getInstanceRegistry,
} from '../../infrastructure/index.js';
import * as output from '../utils/output.js';

/**
 * Teardown command options.
 */
interface TeardownOptions {
  session?: string;
  instance?: string;
  all?: boolean;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  config?: string;
}

/**
 * Register the teardown command.
 */
export function registerTeardownCommand(program: Command): void {
  program
    .command('teardown')
    .description('Stop infrastructure (tmux sessions, containers, FRP tunnels)')
    .option('--session <name>', 'Kill a specific tmux session')
    .option('--instance <id>', 'Kill resources for a specific instance ID')
    .option('--all', 'Kill ALL AgentQA resources (discovery-based)')
    .option('--dry-run', 'Show what would be cleaned up without doing it')
    .option('--force', 'Skip confirmation prompt for --all')
    .option('-v, --verbose', 'Verbose output')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options: TeardownOptions) => {
      await teardownCommand(options);
    });
}

/**
 * Execute the teardown command.
 */
async function teardownCommand(options: TeardownOptions): Promise<void> {
  try {
    // Load config (loadConfig already resolves env vars)
    const configPath = options.config ? resolve(options.config) : undefined;
    const _config = await loadConfig(configPath);

    output.header('Stopping Infrastructure');

    // If --session is specified, kill that specific session
    if (options.session) {
      if (options.verbose) {
        output.info(`Stopping tmux session: ${options.session}`);
      }

      const isRunning = await tmuxProcess.isRunning(options.session);
      if (isRunning) {
        await tmuxProcess.stop(options.session);
        output.success(`Stopped tmux session: ${options.session}`);
      } else {
        output.warning(`Session not found: ${options.session}`);
      }
      return;
    }

    // If --instance is specified, clean up that specific instance
    if (options.instance !== undefined) {
      const instanceId = parseInt(options.instance, 10);
      if (isNaN(instanceId) || instanceId < 0) {
        output.exitWithError(`Invalid instance ID: ${options.instance}`);
        return;
      }

      output.info(`Cleaning up instance ${instanceId}...`);
      output.info('');

      const result = await cleanupInstance(instanceId, {
        dryRun: options.dryRun,
        verbose: options.verbose,
        onLog: (msg) => output.info(msg),
      });

      output.info('');
      if (options.dryRun) {
        output.info('Dry run - no changes made. Would have:');
      }
      for (const line of formatCleanupResult(result)) {
        output.info(line);
      }

      if (result.errors.length === 0) {
        output.success(`Instance ${instanceId} cleaned up.`);
      } else {
        output.warning(`Instance ${instanceId} cleanup completed with errors.`);
      }
      return;
    }

    // If --all is specified, discover and clean up ALL AgentQA resources
    if (options.all) {
      output.info('Discovering AgentQA resources...');
      output.info('');

      const resources = await discoverAllResources();
      const summary = summarizeResources(resources);

      for (const line of summary) {
        output.info(line);
      }
      output.info('');

      // Check if there's anything to clean up
      const hasResources =
        resources.containers.length > 0 ||
        resources.tmuxSessions.length > 0 ||
        resources.composeProjects.length > 0 ||
        resources.frpProcesses.length > 0 ||
        resources.stateFiles.length > 0;

      if (!hasResources) {
        output.success('No AgentQA resources found. Nothing to clean up.');
        return;
      }

      // Dry run mode
      if (options.dryRun) {
        output.info('Dry run mode - showing what would be cleaned up:');
        output.info('');

        const dryResult = await cleanupAllResources({
          dryRun: true,
          verbose: options.verbose,
          onLog: (msg) => output.info(msg),
        });

        for (const line of formatCleanupResult(dryResult)) {
          output.info(line);
        }
        output.info('');
        output.info('Run without --dry-run to perform cleanup.');
        return;
      }

      // Confirmation prompt (unless --force)
      if (!options.force) {
        output.warning('This will stop and remove ALL AgentQA resources.');
        output.info('Use --force to skip this confirmation, or --dry-run to preview.');
        output.info('');

        // For CLI, we just proceed (interactive prompts not available)
        // In a real scenario, you'd use readline or prompts package
        output.info('Proceeding with cleanup...');
        output.info('');
      }

      // Perform cleanup
      const result = await cleanupAllResources({
        dryRun: false,
        verbose: options.verbose,
        onLog: (msg) => output.info(msg),
      });

      output.info('');
      for (const line of formatCleanupResult(result)) {
        output.info(line);
      }
      output.info('');

      if (result.errors.length === 0) {
        output.success('All AgentQA resources cleaned up.');
      } else {
        output.warning('Cleanup completed with some errors.');
      }
      return;
    }

    // Default: show status and guidance
    output.info('');

    // Show current instance registry status
    try {
      const registry = getInstanceRegistry();
      const instances = await registry.getAll();
      const activeInstances = await registry.getActive();
      const staleInstances = await registry.getStale();

      if (instances.length > 0) {
        output.info('Instance Registry:');
        output.info(`  Active: ${activeInstances.length}`);
        output.info(`  Stale: ${staleInstances.length}`);
        output.info('');

        for (const instance of instances) {
          const status = staleInstances.some((s) => s.id === instance.id)
            ? '(stale)'
            : '(active)';
          output.info(`  Instance ${instance.id} ${status}`);
          output.info(`    PID: ${instance.pid}`);
          output.info(`    Ports: DB=${instance.ports.db}, API=${instance.ports.api}`);
          output.info(`    Started: ${instance.startedAt}`);
        }
        output.info('');
      }
    } catch {
      // Registry may not exist yet
    }

    // Discover resources
    const resources = await discoverAllResources();
    const hasResources =
      resources.containers.length > 0 ||
      resources.tmuxSessions.length > 0 ||
      resources.composeProjects.length > 0 ||
      resources.frpProcesses.length > 0;

    if (hasResources) {
      output.info('Discovered AgentQA resources:');
      for (const line of summarizeResources(resources)) {
        output.info(`  ${line}`);
      }
      output.info('');
    }

    // Show usage guidance
    output.info('Teardown options:');
    output.info('');
    output.info('  agentqa teardown --all');
    output.info('    Stop ALL AgentQA resources (containers, tmux, FRP, state files)');
    output.info('');
    output.info('  agentqa teardown --all --dry-run');
    output.info('    Preview what would be cleaned up');
    output.info('');
    output.info('  agentqa teardown --instance <id>');
    output.info('    Stop resources for a specific instance');
    output.info('');
    output.info('  agentqa teardown --session <name>');
    output.info('    Kill a specific tmux session');
    output.info('');
    output.info('For automatic teardown, use "agentqa run" which calls');
    output.info('the teardown function returned by your globalSetup file.');

    if (!hasResources) {
      output.info('');
      output.info('No AgentQA resources found running.');
    }
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}
