/**
 * CLI Module
 *
 * Command-line interface for agent-qa.
 */

import { Command } from 'commander';

import {
  registerRunCommand,
  registerChatCommand,
  registerDbCommand,
  registerSetupCommand,
  registerTeardownCommand,
  registerInstancesCommand,
  registerTokensCommand,
  registerSchemaTokensCommand,
  registerAnalyzeTokensCommand,
} from './commands/index.js';

// Re-export for convenience
export * from './commands/index.js';
export * as output from './utils/output.js';

/**
 * Create the CLI program.
 */
export function createCli(): Command {
  const program = new Command();

  program
    .name('agent-qa')
    .description('Framework-based AI agent testing')
    .version('0.1.0');

  // Register commands
  registerRunCommand(program);
  registerChatCommand(program);
  registerDbCommand(program);
  registerSetupCommand(program);
  registerTeardownCommand(program);
  registerInstancesCommand(program);
  registerTokensCommand(program);
  registerSchemaTokensCommand(program);
  registerAnalyzeTokensCommand(program);

  return program;
}

/**
 * Run the CLI.
 */
export function runCli(): void {
  const program = createCli();
  program.parse();
}
