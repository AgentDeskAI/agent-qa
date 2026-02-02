/**
 * Schema Tokens Command
 *
 * Analyze token consumption of Zod schemas.
 */

import type { Command } from 'commander';

import {
  analyzeSchema,
  analyzeModule,
  evaluateSchemaCode,
  formatBytes,
  formatNumber,
  type SchemaAnalysis,
} from '../utils/schema-analyzer.js';
import * as output from '../utils/output.js';

/**
 * Default model for token counting.
 */
const DEFAULT_MODEL = 'claude-haiku-4-5';

/**
 * Schema tokens command options.
 */
interface SchemaTokensOptions {
  model?: string;
  export?: string;
  pattern?: string;
  name?: string;
  json?: boolean;
  verbose?: boolean;
  sort?: 'tokens' | 'name';
}

/**
 * Register the schema-tokens command.
 */
export function registerSchemaTokensCommand(program: Command): void {
  program
    .command('schema-tokens [path]')
    .description('Analyze token consumption of Zod schemas')
    .option('-m, --model <name>', 'Model to use for token counting', DEFAULT_MODEL)
    .option('-e, --export <name>', 'Specific export to analyze')
    .option('-p, --pattern <regex>', 'Filter exports by pattern (e.g., "Schema$")')
    .option('-n, --name <name>', 'Name for stdin schema', 'Schema')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Include full JSON schemas in output')
    .option('--sort <field>', 'Sort by: tokens, name', 'tokens')
    .action(async (path: string | undefined, options: SchemaTokensOptions) => {
      await schemaTokensCommand(path, options);
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
 * Sort results by the specified field.
 */
function sortResults(
  results: SchemaAnalysis[],
  sortBy: 'tokens' | 'name'
): SchemaAnalysis[] {
  return [...results].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    // Default: sort by tokens descending
    return b.tokenCount - a.tokenCount;
  });
}

/**
 * Output results as a table.
 */
function outputTable(results: SchemaAnalysis[], model: string): void {
  console.log('');
  console.log(
    `${output.color('cyan', 'Schema Token Analysis')} (${output.color('dim', model)})`
  );
  console.log(output.color('dim', '─'.repeat(60)));

  // Header
  console.log(
    `${padRight('Schema Name', 35)} │ ${padLeft('Tokens', 8)} │ ${padLeft('Size', 10)}`
  );
  console.log(output.color('dim', '─'.repeat(60)));

  // Rows
  for (const result of results) {
    const name = result.name.length > 33 ? result.name.slice(0, 30) + '...' : result.name;
    console.log(
      `${padRight(name, 35)} │ ${padLeft(formatNumber(result.tokenCount), 8)} │ ${padLeft(formatBytes(result.jsonSize), 10)}`
    );
  }

  // Total
  console.log(output.color('dim', '─'.repeat(60)));
  const totalTokens = results.reduce((sum, r) => sum + r.tokenCount, 0);
  const totalSize = results.reduce((sum, r) => sum + r.jsonSize, 0);
  console.log(
    `${padRight(output.color('green', 'Total'), 35)} │ ${padLeft(output.color('green', formatNumber(totalTokens)), 8)} │ ${padLeft(formatBytes(totalSize), 10)}`
  );
  console.log('');
}

/**
 * Output results as JSON.
 */
function outputJson(
  results: SchemaAnalysis[],
  model: string,
  verbose: boolean
): void {
  const totalTokens = results.reduce((sum, r) => sum + r.tokenCount, 0);
  const totalSize = results.reduce((sum, r) => sum + r.jsonSize, 0);

  const schemas = results.map((r) => {
    const base = {
      name: r.name,
      tokens: r.tokenCount,
      jsonSize: r.jsonSize,
    };
    if (verbose) {
      return { ...base, jsonSchema: r.jsonSchema };
    }
    return base;
  });

  output.json({
    model,
    schemas,
    total: {
      tokens: totalTokens,
      jsonSize: totalSize,
    },
  });
}

/**
 * Right-pad a string.
 */
function padRight(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const visibleLen = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  return str + ' '.repeat(Math.max(0, len - visibleLen));
}

/**
 * Left-pad a string.
 */
function padLeft(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const visibleLen = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  return ' '.repeat(Math.max(0, len - visibleLen)) + str;
}

/**
 * Execute the schema-tokens command.
 */
async function schemaTokensCommand(
  path: string | undefined,
  options: SchemaTokensOptions
): Promise<void> {
  try {
    const model = options.model ?? DEFAULT_MODEL;
    let results: SchemaAnalysis[];

    if (path) {
      // File mode: analyze a module
      const pattern = options.pattern ? new RegExp(options.pattern) : undefined;
      results = await analyzeModule(path, {
        model,
        exportName: options.export,
        pattern,
      });
    } else {
      // Stdin mode: analyze raw Zod schema code
      const stdinCode = await readStdin();

      if (!stdinCode) {
        output.exitWithError(
          'No input provided. Usage:\n' +
            '  agentqa schema-tokens <path>           # Analyze a TypeScript/JavaScript file\n' +
            '  echo "z.object({...})" | agentqa schema-tokens  # Analyze stdin'
        );
      }

      // Evaluate the schema code
      const schema = evaluateSchemaCode(stdinCode);
      const name = options.name ?? 'Schema';
      const analysis = await analyzeSchema(name, schema, { model });
      results = [analysis];
    }

    // Sort results
    const sortBy = options.sort === 'name' ? 'name' : 'tokens';
    const sortedResults = sortResults(results, sortBy);

    // Output
    if (options.json) {
      outputJson(sortedResults, model, options.verbose ?? false);
    } else {
      outputTable(sortedResults, model);

      // Show verbose output (JSON schemas) if requested
      if (options.verbose) {
        console.log(output.color('cyan', 'JSON Schemas:'));
        console.log(output.color('dim', '─'.repeat(60)));
        for (const result of sortedResults) {
          console.log(`\n${output.color('green', result.name)}:`);
          console.log(result.jsonString);
        }
      }
    }
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}
