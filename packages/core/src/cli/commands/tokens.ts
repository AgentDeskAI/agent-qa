/**
 * Tokens Command
 *
 * Count tokens in text using Anthropic's count_tokens API.
 */

import type { Command } from 'commander';

import { createAnthropicCounter } from '@agent-qa/cost-registry/counting';

import * as output from '../utils/output.js';

/**
 * Default model for token counting.
 */
const DEFAULT_MODEL = 'claude-haiku-4-5';

/**
 * Tokens command options.
 */
interface TokensOptions {
  model?: string;
  json?: boolean;
}

/**
 * Register the tokens command.
 */
export function registerTokensCommand(program: Command): void {
  program
    .command('tokens [text]')
    .description('Count tokens in text using Anthropic API')
    .option('-m, --model <name>', 'Model to use for counting', DEFAULT_MODEL)
    .option('--json', 'Output as JSON')
    .action(async (text: string | undefined, options: TokensOptions) => {
      await tokensCommand(text, options);
    });
}

/**
 * Read text from stdin if available.
 */
async function readStdin(): Promise<string | undefined> {
  // Check if stdin is a TTY (terminal) - if so, no piped input
  if (process.stdin.isTTY) {
    return undefined;
  }

  return new Promise((resolve) => {
    let data = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data.trim() || undefined);
    });

    // Timeout after 100ms if no data (for non-TTY but empty stdin)
    setTimeout(() => {
      if (!data) {
        resolve(undefined);
      }
    }, 100);
  });
}

/**
 * Execute the tokens command.
 */
async function tokensCommand(text: string | undefined, options: TokensOptions): Promise<void> {
  try {
    // Try to get text from argument or stdin
    let inputText = text;

    if (!inputText) {
      inputText = await readStdin();
    }

    if (!inputText) {
      output.exitWithError(
        'No text provided. Usage: agentqa tokens "your text" or echo "text" | agentqa tokens'
      );
    }

    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      output.exitWithError(
        'ANTHROPIC_API_KEY environment variable is required. Set it with: export ANTHROPIC_API_KEY=your-key'
      );
    }

    const model = options.model ?? DEFAULT_MODEL;

    // Create the Anthropic counter
    const counter = createAnthropicCounter({
      model,
      apiKey,
    });

    // Count tokens
    const tokenCount = await counter(inputText);

    // Output based on format
    if (options.json) {
      output.json({
        tokens: tokenCount,
        model,
      });
    } else {
      console.log(`Token count: ${output.color('green', String(tokenCount))}`);
      console.log(`Model: ${output.color('dim', model)}`);
    }
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}
