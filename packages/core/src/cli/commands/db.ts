/**
 * DB Command
 *
 * Database inspection utilities.
 */

import { resolve } from 'node:path';

import type { Command } from 'commander';

import { loadConfig } from '../../config/index.js';
import type { ResolvedConfig } from '../../config/types.js';
import * as output from '../utils/output.js';

/**
 * DB command options.
 */
interface DbOptions {
  user?: string;
  limit?: string;
  json?: boolean;
  config?: string;
}

/**
 * Register the db command.
 */
export function registerDbCommand(program: Command): void {
  program
    .command('db [entity]')
    .description('Inspect database entities')
    .option('-u, --user <id>', 'Filter by user ID')
    .option('-l, --limit <count>', 'Limit results (default: 10)')
    .option('--json', 'Output as JSON')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (entity: string | undefined, options: DbOptions) => {
      await dbCommand(entity, options);
    });
}

/**
 * Execute the db command.
 */
async function dbCommand(entity: string | undefined, options: DbOptions): Promise<void> {
  try {
    // Load config (loadConfig already resolves env vars)
    const configPath = options.config ? resolve(options.config) : undefined;
    const config = await loadConfig(configPath);

    // If no entity specified, list available entities
    if (!entity) {
      await listEntities(config, options);
      return;
    }

    // Query the entity
    await queryEntity(config, entity, options);
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * List available entities.
 */
async function listEntities(
  config: ResolvedConfig,
  options: DbOptions
): Promise<void> {
  if (!config.database?.entities || config.database.entities.length === 0) {
    output.warning('No entities configured in agent-qa.config.ts');
    output.info('Add entities to the database.entities array in your config.');
    return;
  }

  output.header('Available Entities');

  const entities = config.database.entities.map((e) => ({
    name: e.name,
    titleColumn: e.titleColumn ?? 'id',
  }));

  if (options.json) {
    output.json(entities);
  } else {
    output.table(entities);
  }
}

/**
 * Query a specific entity.
 */
async function queryEntity(
  config: ResolvedConfig,
  entityName: string,
  options: DbOptions
): Promise<void> {
  // Find the entity config
  const entityConfig = config.database?.entities?.find((e) => e.name === entityName);

  if (!entityConfig) {
    output.error(`Entity not found: ${entityName}`);
    output.info('Available entities:');
    config.database?.entities?.forEach((e) => {
      console.log(`  - ${e.name}`);
    });
    process.exit(1);
  }

  // This is a placeholder - real implementation would use the database adapter
  output.warning(
    'Database inspection requires a connected database adapter.\n' +
      'The current implementation is a placeholder.\n\n' +
      'To use this feature, ensure your agent-qa.config.ts has a database section\n' +
      'and the database is running.'
  );

  // Show what would be queried
  output.header(`Query: ${entityName}`);
  console.log(`  Entity: ${entityName}`);
  console.log(`  Title Column: ${entityConfig.titleColumn ?? 'id'}`);

  if (options.user) {
    console.log(`  Filter: userId = ${options.user}`);
  }

  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  console.log(`  Limit: ${limit}`);
}
