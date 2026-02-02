/**
 * Instances Command
 *
 * Display status of AgentQA instances.
 */

import type { Command } from 'commander';

import {
  getInstanceRegistry,
  INFRASTRUCTURE_CONFIG,
  discoverAllResources,
  summarizeResources,
} from '../../infrastructure/index.js';
import * as output from '../utils/output.js';

/**
 * Instances command options.
 */
interface InstancesOptions {
  clean?: boolean;
  verbose?: boolean;
  json?: boolean;
}

/**
 * Format a timestamp to relative time.
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) {
    return `${diffDay}d ago`;
  } else if (diffHour > 0) {
    return `${diffHour}h ago`;
  } else if (diffMin > 0) {
    return `${diffMin}m ago`;
  } else {
    return 'just now';
  }
}

/**
 * Register the instances command.
 */
export function registerInstancesCommand(program: Command): void {
  program
    .command('instances')
    .description('List AgentQA instances and their status')
    .option('--clean', 'Remove stale instances from the registry')
    .option('-v, --verbose', 'Show detailed information')
    .option('--json', 'Output as JSON')
    .action(async (options: InstancesOptions) => {
      await instancesCommand(options);
    });
}

/**
 * Execute the instances command.
 */
async function instancesCommand(options: InstancesOptions): Promise<void> {
  try {
    const registry = getInstanceRegistry();

    // Clean stale instances if requested
    if (options.clean) {
      output.info('Cleaning stale instances...');
      const removed = await registry.cleanStale();
      if (removed > 0) {
        output.success(`Removed ${removed} stale instance(s) from registry.`);
      } else {
        output.info('No stale instances to remove.');
      }
      output.info('');
    }

    const allInstances = await registry.getAll();
    const activeInstances = await registry.getActive();
    const staleInstances = await registry.getStale();
    const availableCount = await registry.getAvailableCount();
    const maxInstances = INFRASTRUCTURE_CONFIG.maxInstances;

    // JSON output mode
    if (options.json) {
      const jsonOutput = {
        instances: allInstances.map((instance) => ({
          ...instance,
          isStale: staleInstances.some((s) => s.id === instance.id),
        })),
        summary: {
          active: activeInstances.length,
          stale: staleInstances.length,
          available: availableCount,
          max: maxInstances,
        },
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    output.header('AgentQA Instances');
    output.info('');

    if (allInstances.length === 0) {
      output.info('No instances registered.');
      output.info('');
      output.info(`Available slots: ${availableCount}/${maxInstances}`);
    } else {
      // Table header
      const headerLine = 'ID  \u2502 Ports              \u2502 PID    \u2502 Started';
      const separator = '\u2500'.repeat(headerLine.length);

      output.info(separator);
      output.info(headerLine);
      output.info(separator);

      // Instance rows
      for (const instance of allInstances) {
        const isStale = staleInstances.some((s) => s.id === instance.id);
        const status = isStale ? ' (stale)' : '';
        const ports = `${instance.ports.db}/${instance.ports.api}/${instance.ports.milvus}`;
        const started = formatRelativeTime(instance.startedAt);

        const row = [
          String(instance.id).padEnd(4),
          ports.padEnd(18),
          String(instance.pid).padEnd(6),
          started + status,
        ].join('\u2502 ');

        output.info(row);
      }

      output.info(separator);
      output.info('');
      output.info(`${activeInstances.length} active, ${availableCount} available (max: ${maxInstances})`);

      if (staleInstances.length > 0) {
        output.info('');
        output.warning(`${staleInstances.length} stale instance(s) detected.`);
        output.info('Run "agentqa instances --clean" to remove them.');
      }
    }

    // Show verbose resource discovery
    if (options.verbose) {
      output.info('');
      output.info('Discovered Resources:');
      const resources = await discoverAllResources();
      for (const line of summarizeResources(resources)) {
        output.info(`  ${line}`);
      }
    }

    output.info('');
    output.info('Commands:');
    output.info('  agentqa instances --clean    Remove stale instances');
    output.info('  agentqa teardown --all       Stop all AgentQA resources');
    output.info('  agentqa teardown --instance <id>  Stop specific instance');
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}
