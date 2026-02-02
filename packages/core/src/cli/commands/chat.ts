/**
 * Chat Command
 *
 * Interactive chat with the agent.
 */

import { resolve } from 'node:path';

import type { Command } from 'commander';

import { createHttpAgentFromConfig } from '../../adapters/index.js';
import { loadConfig } from '../../config/index.js';
import * as output from '../utils/output.js';

/**
 * Chat command options.
 */
interface ChatOptions {
  message?: string;
  user?: string;
  thread?: string;
  verbose?: boolean;
  debug?: boolean;
  json?: boolean;
  config?: string;
}

/**
 * Register the chat command.
 */
export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Chat with the agent')
    .option('-m, --message <text>', 'Message to send')
    .option('-u, --user <id>', 'User ID')
    .option('-t, --thread <id>', 'Continue conversation in thread')
    .option('-v, --verbose', 'Show tool calls')
    .option('--debug', 'Show all events and details')
    .option('--json', 'Output raw JSON response')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options: ChatOptions) => {
      await chatCommand(options);
    });
}

/**
 * Execute the chat command.
 */
async function chatCommand(options: ChatOptions): Promise<void> {
  try {
    // Validate message is provided
    if (!options.message) {
      output.exitWithError('Message is required. Use -m "your message"');
    }

    // Load config (loadConfig already resolves env vars)
    const configPath = options.config ? resolve(options.config) : undefined;
    const config = await loadConfig(configPath);

    if (options.debug) {
      output.info(`Using config: ${config.name}`);
      output.info(`Agent URL: ${config.agent.baseUrl}`);
    }

    // Create agent adapter
    const agent = createHttpAgentFromConfig(config.agent);

    // Determine user ID
    const userId = options.user ?? config.defaultUserId;

    if (options.debug) {
      output.info(`User ID: ${userId}`);
      if (options.thread) {
        output.info(`Thread ID: ${options.thread}`);
      }
    }

    // Show message
    if (!options.json) {
      output.dim(`You: ${options.message}`);
    }

    // Send message
    const response = await agent.chat({
      message: options.message,
      userId,
      conversationId: options.thread,
    });

    // Output based on format
    if (options.json) {
      output.json(response);
      return;
    }

    // Show tool calls
    if ((options.verbose || options.debug) && response.toolCalls.length > 0) {
      output.divider();
      output.info('Tool Calls:');
      for (const tool of response.toolCalls) {
        console.log(`  ${output.color('cyan', tool.name)}`);
        if (options.debug && tool.args) {
          console.log(output.color('dim', `    ${JSON.stringify(tool.args)}`));
        }
      }
      output.divider();
    }

    // Show response
    console.log('');
    console.log(`${output.color('green', 'Agent:')} ${response.text}`);
    console.log('');

    // Show usage
    if (options.debug && response.usage) {
      output.dim(
        `Tokens: ${response.usage.totalTokens} (in: ${response.usage.inputTokens}, out: ${response.usage.outputTokens})`
      );
    }

    // Show conversation ID for continuing
    if (options.verbose && response.conversationId) {
      output.dim(`Thread: ${response.conversationId}`);
    }
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}
