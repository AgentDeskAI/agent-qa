/**
 * Analyze Tokens Command
 *
 * Analyze token consumption from http-responses.json diagnostics output.
 * Provides turn-by-turn breakdown, per-agent analysis, and cache efficiency metrics.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Command } from 'commander';

import type { HttpResponseData } from '../../diagnostics/raw-writer.js';
import * as output from '../utils/output.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Command options for analyze-tokens.
 */
interface AnalyzeTokensOptions {
  format?: 'table' | 'json' | 'markdown';
  perTurn?: boolean;
  perAgent?: boolean;
  cache?: boolean;
  top?: number;
}

/**
 * Parsed analysis results.
 */
interface AnalysisResult {
  scenarioId?: string;
  turns: TurnAnalysis[];
  totals: TotalAnalysis;
  agents: AgentAnalysis[];
  cache: CacheAnalysis;
}

/**
 * Per-turn token analysis.
 */
interface TurnAnalysis {
  index: number;
  label?: string;
  message: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  durationMs: number;
  agents: Array<{
    agentId: string;
    inputTokens: number;
    outputTokens: number;
    callCount: number;
  }>;
  toolCalls: Array<{
    name: string;
    estimatedResultTokens?: number;
  }>;
}

/**
 * Total token analysis across all turns.
 */
interface TotalAnalysis {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  callCount: number;
  turnCount: number;
  avgTokensPerTurn: number;
  totalDurationMs: number;
}

/**
 * Per-agent token analysis.
 */
interface AgentAnalysis {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  callCount: number;
  percentOfTotal: number;
}

/**
 * Cache efficiency analysis.
 */
interface CacheAnalysis {
  totalCacheableTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheHitRate: number;
  estimatedSavings: number;
  turnsWithCacheHits: number;
  turnsWithCacheWrites: number;
}

// =============================================================================
// Command Registration
// =============================================================================

/**
 * Register the analyze-tokens command.
 */
export function registerAnalyzeTokensCommand(program: Command): void {
  program
    .command('analyze-tokens <path>')
    .description('Analyze token consumption from http-responses.json diagnostics')
    .option('-f, --format <format>', 'Output format: table, json, markdown', 'table')
    .option('--per-turn', 'Show detailed per-turn breakdown')
    .option('--per-agent', 'Show per-agent breakdown')
    .option('--cache', 'Focus on cache analysis')
    .option('--top <n>', 'Show top N token consumers', '5')
    .action(async (inputPath: string, options: AnalyzeTokensOptions) => {
      await analyzeTokensCommand(inputPath, options);
    });
}

// =============================================================================
// Analysis Logic
// =============================================================================

/**
 * Load and parse http-responses.json file.
 */
function loadHttpResponses(inputPath: string): HttpResponseData[] {
  // Handle glob-style paths (find the actual file)
  let resolvedPath = inputPath;

  if (inputPath.includes('*')) {
    // Extract directory pattern and find matching directories
    const parts = inputPath.split('*');
    const baseDir = parts[0];
    const suffix = parts[parts.length - 1];

    if (fs.existsSync(baseDir)) {
      const entries = fs.readdirSync(baseDir);
      // Sort by name descending to get most recent (timestamp-based)
      entries.sort().reverse();

      for (const entry of entries) {
        const candidatePath = path.join(baseDir, entry, suffix.replace(/^\//, ''));
        if (fs.existsSync(candidatePath)) {
          resolvedPath = candidatePath;
          break;
        }
      }
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const data = JSON.parse(content) as HttpResponseData[];

  if (!Array.isArray(data)) {
    throw new Error('Expected http-responses.json to contain an array');
  }

  return data;
}

/**
 * Analyze a single turn/step.
 */
function analyzeTurn(response: HttpResponseData): TurnAnalysis {
  const usage = response.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const detailedUsage = response.detailedUsage;

  // Extract agent summaries
  const agents =
    detailedUsage?.agentSummaries?.map((a) => ({
      agentId: a.agentId,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      callCount: a.callCount,
    })) ?? [];

  // Extract tool calls
  const toolCalls =
    response.toolCalls?.map((tc) => ({
      name: tc.name,
      estimatedResultTokens: tc.result
        ? Math.ceil(JSON.stringify(tc.result).length / 4)
        : undefined,
    })) ?? [];

  // Cache tokens from totals
  const cacheReadTokens = detailedUsage?.totals?.cacheReadTokens ?? 0;
  const cacheCreationTokens = detailedUsage?.totals?.cacheCreationTokens ?? 0;

  return {
    index: response.stepIndex,
    label: response.stepLabel,
    message: response.message,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cacheReadTokens,
    cacheCreationTokens,
    durationMs: response.durationMs,
    agents,
    toolCalls,
  };
}

/**
 * Perform full analysis on http responses.
 */
function analyzeResponses(responses: HttpResponseData[]): AnalysisResult {
  const turns = responses.map(analyzeTurn);

  // Aggregate totals
  const totals: TotalAnalysis = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    callCount: 0,
    turnCount: turns.length,
    avgTokensPerTurn: 0,
    totalDurationMs: 0,
  };

  for (const turn of turns) {
    totals.inputTokens += turn.inputTokens;
    totals.outputTokens += turn.outputTokens;
    totals.totalTokens += turn.totalTokens;
    totals.cacheReadTokens += turn.cacheReadTokens;
    totals.cacheCreationTokens += turn.cacheCreationTokens;
    totals.callCount += turn.agents.reduce((sum, a) => sum + a.callCount, 0);
    totals.totalDurationMs += turn.durationMs;
  }

  totals.avgTokensPerTurn = turns.length > 0 ? Math.round(totals.totalTokens / turns.length) : 0;

  // Aggregate by agent
  const agentMap = new Map<
    string,
    { inputTokens: number; outputTokens: number; callCount: number }
  >();

  for (const turn of turns) {
    for (const agent of turn.agents) {
      const existing = agentMap.get(agent.agentId) ?? {
        inputTokens: 0,
        outputTokens: 0,
        callCount: 0,
      };
      existing.inputTokens += agent.inputTokens;
      existing.outputTokens += agent.outputTokens;
      existing.callCount += agent.callCount;
      agentMap.set(agent.agentId, existing);
    }
  }

  const agents: AgentAnalysis[] = Array.from(agentMap.entries())
    .map(([agentId, data]) => ({
      agentId,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      callCount: data.callCount,
      percentOfTotal:
        totals.totalTokens > 0
          ? Math.round(((data.inputTokens + data.outputTokens) / totals.totalTokens) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  // Cache analysis
  const turnsWithCacheHits = turns.filter((t) => t.cacheReadTokens > 0).length;
  const turnsWithCacheWrites = turns.filter((t) => t.cacheCreationTokens > 0).length;
  const totalCacheableTokens = totals.cacheReadTokens + totals.cacheCreationTokens;
  const cacheHitRate =
    totalCacheableTokens > 0
      ? Math.round((totals.cacheReadTokens / totalCacheableTokens) * 1000) / 10
      : 0;

  // Estimate savings: cache reads cost 0.1x vs 1.0x for base input
  const estimatedSavings = Math.round(totals.cacheReadTokens * 0.9);

  const cache: CacheAnalysis = {
    totalCacheableTokens,
    cacheReadTokens: totals.cacheReadTokens,
    cacheCreationTokens: totals.cacheCreationTokens,
    cacheHitRate,
    estimatedSavings,
    turnsWithCacheHits,
    turnsWithCacheWrites,
  };

  return { turns, totals, agents, cache };
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Format number with commas.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Right-pad a string.
 */
function padRight(str: string, len: number): string {
  const visibleLen = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  return str + ' '.repeat(Math.max(0, len - visibleLen));
}

/**
 * Left-pad a string.
 */
function padLeft(str: string, len: number): string {
  const visibleLen = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  return ' '.repeat(Math.max(0, len - visibleLen)) + str;
}

/**
 * Output results as a table.
 */
function outputTable(result: AnalysisResult, options: AnalyzeTokensOptions): void {
  const { totals, agents, cache, turns } = result;

  // Summary header
  console.log('');
  console.log(
    `${output.color('cyan', 'Token Consumption Analysis')} (${output.color('dim', `${totals.turnCount} turns`)})`
  );
  console.log(output.color('dim', '═'.repeat(70)));

  // Overall totals
  console.log('');
  console.log(output.color('bold', 'Overall Totals'));
  console.log(output.color('dim', '─'.repeat(70)));
  console.log(
    `${padRight('Input Tokens:', 25)} ${padLeft(output.color('green', formatNumber(totals.inputTokens)), 12)}`
  );
  console.log(
    `${padRight('Output Tokens:', 25)} ${padLeft(formatNumber(totals.outputTokens), 12)}`
  );
  console.log(
    `${padRight('Total Tokens:', 25)} ${padLeft(output.color('bold', formatNumber(totals.totalTokens)), 12)}`
  );
  console.log(
    `${padRight('Avg Tokens/Turn:', 25)} ${padLeft(formatNumber(totals.avgTokensPerTurn), 12)}`
  );
  console.log(
    `${padRight('LLM Calls:', 25)} ${padLeft(formatNumber(totals.callCount), 12)}`
  );
  console.log(
    `${padRight('Total Duration:', 25)} ${padLeft(output.formatDuration(totals.totalDurationMs), 12)}`
  );

  // Cache analysis
  if (options.cache || cache.totalCacheableTokens > 0) {
    console.log('');
    console.log(output.color('bold', 'Cache Analysis'));
    console.log(output.color('dim', '─'.repeat(70)));
    console.log(
      `${padRight('Cache Read Tokens:', 25)} ${padLeft(output.color('green', formatNumber(cache.cacheReadTokens)), 12)} (saved ~${formatNumber(cache.estimatedSavings)} tokens)`
    );
    console.log(
      `${padRight('Cache Write Tokens:', 25)} ${padLeft(formatNumber(cache.cacheCreationTokens), 12)}`
    );
    console.log(
      `${padRight('Cache Hit Rate:', 25)} ${padLeft(cache.cacheHitRate + '%', 12)}`
    );
    console.log(
      `${padRight('Turns with Cache Hits:', 25)} ${padLeft(`${cache.turnsWithCacheHits}/${totals.turnCount}`, 12)}`
    );
  }

  // Per-agent breakdown
  if (options.perAgent || agents.length > 0) {
    console.log('');
    console.log(output.color('bold', 'Per-Agent Breakdown'));
    console.log(output.color('dim', '─'.repeat(70)));
    console.log(
      `${padRight('Agent', 25)} │ ${padLeft('Input', 10)} │ ${padLeft('Output', 10)} │ ${padLeft('Calls', 6)} │ ${padLeft('%', 6)}`
    );
    console.log(output.color('dim', '─'.repeat(70)));

    for (const agent of agents) {
      console.log(
        `${padRight(agent.agentId, 25)} │ ${padLeft(formatNumber(agent.inputTokens), 10)} │ ${padLeft(formatNumber(agent.outputTokens), 10)} │ ${padLeft(String(agent.callCount), 6)} │ ${padLeft(agent.percentOfTotal + '%', 6)}`
      );
    }
  }

  // Per-turn breakdown
  if (options.perTurn) {
    console.log('');
    console.log(output.color('bold', 'Per-Turn Breakdown'));
    console.log(output.color('dim', '─'.repeat(70)));

    for (const turn of turns) {
      const label = turn.label ?? `Turn ${turn.index + 1}`;
      const msgPreview = turn.message.length > 40 ? turn.message.slice(0, 37) + '...' : turn.message;

      console.log('');
      console.log(`${output.color('cyan', label)}: "${output.color('dim', msgPreview)}"`);
      console.log(
        `  Input: ${formatNumber(turn.inputTokens)} │ Output: ${formatNumber(turn.outputTokens)} │ Total: ${output.color('green', formatNumber(turn.totalTokens))}`
      );

      if (turn.cacheReadTokens > 0 || turn.cacheCreationTokens > 0) {
        console.log(
          `  Cache: ${output.color('green', formatNumber(turn.cacheReadTokens))} read, ${formatNumber(turn.cacheCreationTokens)} write`
        );
      }

      if (turn.agents.length > 0) {
        const agentSummary = turn.agents
          .map((a) => `${a.agentId}(${formatNumber(a.inputTokens)})`)
          .join(', ');
        console.log(`  Agents: ${output.color('dim', agentSummary)}`);
      }

      if (turn.toolCalls.length > 0) {
        const toolSummary = turn.toolCalls.map((t) => t.name).join(', ');
        console.log(`  Tools: ${output.color('dim', toolSummary)}`);
      }
    }
  }

  // Token accumulation over turns
  if (!options.perTurn && turns.length > 1) {
    console.log('');
    console.log(output.color('bold', 'Token Accumulation'));
    console.log(output.color('dim', '─'.repeat(70)));

    let cumulative = 0;
    for (const turn of turns) {
      cumulative += turn.totalTokens;
      const label = turn.label ?? `Turn ${turn.index + 1}`;
      const bar = '█'.repeat(Math.min(30, Math.round((cumulative / totals.totalTokens) * 30)));
      console.log(
        `${padRight(label, 20)} ${padLeft(formatNumber(turn.totalTokens), 8)} │ ${output.color('cyan', bar)} ${formatNumber(cumulative)}`
      );
    }
  }

  console.log('');
}

/**
 * Output results as JSON.
 */
function outputJson(result: AnalysisResult): void {
  output.json(result);
}

/**
 * Output results as Markdown.
 */
function outputMarkdown(result: AnalysisResult, options: AnalyzeTokensOptions): void {
  const { totals, agents, cache, turns } = result;

  console.log('# Token Consumption Analysis');
  console.log('');
  console.log(`**Turns:** ${totals.turnCount}`);
  console.log('');

  console.log('## Overall Totals');
  console.log('');
  console.log('| Metric | Value |');
  console.log('|--------|-------|');
  console.log(`| Input Tokens | ${formatNumber(totals.inputTokens)} |`);
  console.log(`| Output Tokens | ${formatNumber(totals.outputTokens)} |`);
  console.log(`| **Total Tokens** | **${formatNumber(totals.totalTokens)}** |`);
  console.log(`| Avg Tokens/Turn | ${formatNumber(totals.avgTokensPerTurn)} |`);
  console.log(`| LLM Calls | ${totals.callCount} |`);
  console.log(`| Total Duration | ${output.formatDuration(totals.totalDurationMs)} |`);
  console.log('');

  if (cache.totalCacheableTokens > 0) {
    console.log('## Cache Analysis');
    console.log('');
    console.log('| Metric | Value |');
    console.log('|--------|-------|');
    console.log(`| Cache Read Tokens | ${formatNumber(cache.cacheReadTokens)} |`);
    console.log(`| Cache Write Tokens | ${formatNumber(cache.cacheCreationTokens)} |`);
    console.log(`| Cache Hit Rate | ${cache.cacheHitRate}% |`);
    console.log(`| Estimated Savings | ~${formatNumber(cache.estimatedSavings)} tokens |`);
    console.log('');
  }

  if (agents.length > 0) {
    console.log('## Per-Agent Breakdown');
    console.log('');
    console.log('| Agent | Input | Output | Calls | % |');
    console.log('|-------|-------|--------|-------|---|');
    for (const agent of agents) {
      console.log(
        `| ${agent.agentId} | ${formatNumber(agent.inputTokens)} | ${formatNumber(agent.outputTokens)} | ${agent.callCount} | ${agent.percentOfTotal}% |`
      );
    }
    console.log('');
  }

  if (options.perTurn) {
    console.log('## Per-Turn Breakdown');
    console.log('');
    for (const turn of turns) {
      const label = turn.label ?? `Turn ${turn.index + 1}`;
      console.log(`### ${label}`);
      console.log('');
      console.log(`**Message:** "${turn.message}"`);
      console.log('');
      console.log(`- Input: ${formatNumber(turn.inputTokens)}`);
      console.log(`- Output: ${formatNumber(turn.outputTokens)}`);
      console.log(`- Total: ${formatNumber(turn.totalTokens)}`);
      if (turn.cacheReadTokens > 0) {
        console.log(`- Cache Read: ${formatNumber(turn.cacheReadTokens)}`);
      }
      console.log('');
    }
  }
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute the analyze-tokens command.
 */
async function analyzeTokensCommand(inputPath: string, options: AnalyzeTokensOptions): Promise<void> {
  try {
    // Load data
    const responses = loadHttpResponses(inputPath);

    if (responses.length === 0) {
      output.exitWithError('No HTTP responses found in file');
    }

    // Analyze
    const result = analyzeResponses(responses);

    // Output based on format
    const format = options.format ?? 'table';

    switch (format) {
      case 'json':
        outputJson(result);
        break;
      case 'markdown':
        outputMarkdown(result, options);
        break;
      case 'table':
      default:
        outputTable(result, options);
        break;
    }
  } catch (error) {
    output.exitWithError(error instanceof Error ? error.message : String(error));
  }
}
