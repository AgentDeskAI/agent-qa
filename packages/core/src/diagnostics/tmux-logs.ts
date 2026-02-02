/**
 * Tmux Log Provider
 *
 * Captures logs from tmux sessions for failure diagnostics.
 */

import { execSync } from 'node:child_process';

import type {
  DiagnosticsProvider,
  FailureContext,
  DiagnosticsData,
  TmuxConfig,
} from './types.js';

// =============================================================================
// Tmux Log Provider
// =============================================================================

/**
 * Create a diagnostics provider that captures logs from a tmux session.
 *
 * @example
 * ```typescript
 * const logProvider = createTmuxLogProvider({
 *   sessionName: 'api-server',
 *   lines: 100,
 * });
 * ```
 */
export function createTmuxLogProvider(config: TmuxConfig): DiagnosticsProvider {
  const { sessionName, lines = 100, filterByTime = true } = config;

  return {
    name: `tmux-logs:${sessionName}`,

    async collect(context: FailureContext): Promise<DiagnosticsData | null> {
      // Check if session exists
      if (!hasSession(sessionName)) {
        return null;
      }

      // Capture logs
      const logs = captureLogs(sessionName, lines);
      if (
        !logs ||
        logs === '(No tmux session found)' ||
        logs === '(Failed to capture tmux pane)'
      ) {
        return null;
      }

      // Optionally filter to logs after step start time
      const filteredLogs = filterByTime
        ? filterLogsAfterTime(logs, context.startTime)
        : logs;

      if (!filteredLogs.trim()) {
        return null;
      }

      return {
        type: 'logs',
        title: `Tmux Session: ${sessionName}`,
        content: formatAsMarkdown(filteredLogs, context),
        raw: {
          sessionName,
          lines: filteredLogs.split('\n'),
          capturedAt: new Date().toISOString(),
        },
      };
    },
  };
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Check if a tmux session exists.
 */
function hasSession(sessionName: string): boolean {
  try {
    execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`, {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture logs from a tmux session.
 */
function captureLogs(sessionName: string, lines: number = 100): string {
  if (!hasSession(sessionName)) {
    return '(No tmux session found)';
  }

  try {
    // capture-pane -p prints to stdout, -S -N captures N lines from history
    return execSync(`tmux capture-pane -t "${sessionName}" -p -S -${lines}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return '(Failed to capture tmux pane)';
  }
}

// =============================================================================
// Log Filtering
// =============================================================================

/**
 * Filter logs to only include lines after a given time.
 * This is a best-effort filter based on common timestamp formats.
 */
function filterLogsAfterTime(logs: string, startTime: Date): string {
  const lines = logs.split('\n');
  const startMs = startTime.getTime();
  const result: string[] = [];
  let foundRelevant = false;

  for (const line of lines) {
    // Try to extract timestamp from line
    const timestamp = extractTimestamp(line);

    if (timestamp && timestamp >= startMs) {
      foundRelevant = true;
    }

    // Include line if we've found relevant logs or no timestamp parsing worked
    if (foundRelevant || !timestamp) {
      result.push(line);
    }
  }

  // If we couldn't find any timestamps, return all logs
  if (!foundRelevant) {
    return logs;
  }

  return result.join('\n');
}

/**
 * Try to extract a timestamp from a log line.
 * Returns timestamp in milliseconds, or null if not found.
 */
function extractTimestamp(line: string): number | null {
  // Common timestamp patterns

  // ISO 8601: 2025-01-15T10:30:00.123Z
  const isoMatch = line.match(
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/
  );
  if (isoMatch) {
    const date = new Date(isoMatch[1]);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // Common log format: [2025-01-15 10:30:00]
  const bracketMatch = line.match(
    /\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/
  );
  if (bracketMatch) {
    const date = new Date(`${bracketMatch[1]}T${bracketMatch[2]}`);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // Unix timestamp (seconds or milliseconds)
  const unixMatch = line.match(/\b(\d{10,13})\b/);
  if (unixMatch) {
    const num = parseInt(unixMatch[1], 10);
    // Assume milliseconds if > 1e12, otherwise seconds
    return num > 1e12 ? num : num * 1000;
  }

  return null;
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format logs as markdown for reports.
 */
function formatAsMarkdown(logs: string, context: FailureContext): string {
  const lines: string[] = [];

  lines.push(`**Step ${context.stepIndex + 1}** (${context.stepType})`);
  if (context.stepLabel) {
    lines.push(`**Label:** \`${context.stepLabel}\``);
  }
  lines.push(
    `**Time window:** ${context.startTime.toISOString()} - ${context.endTime.toISOString()}`
  );
  lines.push('');
  lines.push('```');
  lines.push(logs.trim());
  lines.push('```');

  return lines.join('\n');
}

// =============================================================================
// Usage Report Parsing
// =============================================================================

/**
 * Parsed agent breakdown from Usage Report.
 */
export interface ParsedAgentUsage {
  name: string;
  model: string;
  tokens: number;
  percentage: number;
  calls: number;
  cost: string;
  inputTokens: number;
  outputTokens: number;
  inputBreakdown: Record<string, { tokens: number; percent: number }>;
  outputBreakdown: Record<string, { tokens: number; percent: number }>;
}

/**
 * Parsed step from Step-by-Step Analysis.
 */
export interface ParsedStep {
  agent: string;
  stepNumber: number;
  inputTokens: number;
  outputTokens: number;
  delta?: string;
  cost: string;
  timestamp: string;
  breakdown: Record<string, number>;
}

/**
 * Parsed play-by-play event.
 */
export interface ParsedPlayByPlayEvent {
  type: 'user' | 'assistant' | 'tool-call' | 'tool-result' | 'router-to-agent' | 'agent-to-router' | 'agent-step';
  agent?: string;
  text?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  timestamp?: string;
}

/**
 * Complete parsed Usage Report.
 */
export interface ParsedUsageReport {
  // Header info
  sessionId?: string;
  correlationId?: string;
  userInput?: string;
  provider?: string;
  model?: string;
  duration?: number;
  steps?: number;

  // Token totals
  totals: {
    input: number;
    output: number;
    total: number;
    calls: number;
  };

  // Cost estimates
  cost: {
    input: string;
    output: string;
    total: string;
  };

  // Per-agent breakdown
  agents: ParsedAgentUsage[];

  // Step-by-step analysis
  stepAnalysis: ParsedStep[];

  // Provider vs Internal delta
  trackingDelta?: {
    internal: { input: number; output: number };
    provider: { input: number; output: number };
    delta: { input: number; output: number };
    percent: number;
  };

  // Play-by-play
  playByPlay?: {
    history: ParsedPlayByPlayEvent[];
    current: ParsedPlayByPlayEvent[];
  };
}

/**
 * Parse a Usage Report from tmux logs.
 * Returns structured data if found, null otherwise.
 */
export function parseUsageReport(logs: string): ParsedUsageReport | null {
  // Find the Usage Report section
  const reportMatch = logs.match(/# Usage Report[\s\S]*?(?=\n---\n\*Generated|$)/);
  if (!reportMatch) {
    return null;
  }

  const reportText = reportMatch[0];

  // Parse header info
  const sessionId = extractField(reportText, /- Session:\s*(\S+)/);
  const correlationId = extractField(reportText, /- Correlation:\s*(\S+)/);
  const userInput = extractField(reportText, /- User Input:\s*"([^"]+)"/);
  const provider = extractField(reportText, /- Provider:\s*(\S+)/);
  const model = extractField(reportText, /- Model:\s*(\S+)/);
  const durationStr = extractField(reportText, /- Duration:\s*(\d+)ms/);
  const stepsStr = extractField(reportText, /- Steps:\s*(\d+)/);

  // Parse Token Usage
  const inputTokens = parseNumber(extractField(reportText, /## Token Usage[\s\S]*?- Input:\s*([\d,]+)/));
  const outputTokens = parseNumber(extractField(reportText, /## Token Usage[\s\S]*?- Output:\s*([\d,]+)/));
  const totalTokens = parseNumber(extractField(reportText, /## Token Usage[\s\S]*?- Total:\s*([\d,]+)/));
  const callCount = parseNumber(extractField(reportText, /## Token Usage[\s\S]*?- Calls:\s*(\d+)/));

  // Parse Cost Estimate
  const inputCost = extractField(reportText, /## Cost Estimate[\s\S]*?- Input:\s*(\$[\d.]+)/) ?? '$0.00';
  const outputCost = extractField(reportText, /## Cost Estimate[\s\S]*?- Output:\s*(\$[\d.]+)/) ?? '$0.00';
  const totalCost = extractField(reportText, /## Cost Estimate[\s\S]*?- Total:\s*(\$[\d.]+)/) ?? '$0.00';

  // Parse Per-Agent Usage
  const agents = parseAgentUsage(reportText);

  // Parse Step-by-Step Analysis
  const stepAnalysis = parseStepAnalysis(reportText);

  // Parse Provider vs Internal Delta
  const trackingDelta = parseTrackingDelta(reportText);

  // Parse Play-by-Play
  const playByPlay = parsePlayByPlay(reportText);

  return {
    sessionId,
    correlationId,
    userInput,
    provider,
    model,
    duration: durationStr ? parseInt(durationStr, 10) : undefined,
    steps: stepsStr ? parseInt(stepsStr, 10) : undefined,
    totals: {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens,
      calls: callCount,
    },
    cost: {
      input: inputCost,
      output: outputCost,
      total: totalCost,
    },
    agents,
    stepAnalysis,
    trackingDelta,
    playByPlay,
  };
}

/**
 * Extract a field value using regex.
 */
function extractField(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match ? match[1] : undefined;
}

/**
 * Parse a number from a string (handles commas).
 */
function parseNumber(str: string | undefined): number {
  if (!str) return 0;
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}

/**
 * Parse per-agent usage from the "## Per-Agent Total Usage" section.
 */
function parseAgentUsage(reportText: string): ParsedAgentUsage[] {
  const agents: ParsedAgentUsage[] = [];

  // Find the Per-Agent section
  const sectionMatch = reportText.match(
    /## Per-Agent Total Usage[\s\S]*?(?=\n## |$)/
  );
  if (!sectionMatch) return agents;

  const section = sectionMatch[0];

  // Match agent entries: **agent-name (provider/model)**: X tokens (Y%) [Z calls] — $cost
  const agentPattern = /\*\*(\S+)\s*\(([^)]+)\)\*\*:\s*([\d,]+)\s*tokens\s*\(([\d.]+)%\)\s*\[(\d+)\s*calls?\]\s*—\s*(\$[\d.]+)/g;

  let match;
  while ((match = agentPattern.exec(section)) !== null) {
    const agentName = match[1];
    const modelInfo = match[2];
    const tokens = parseNumber(match[3]);
    const percentage = parseFloat(match[4]);
    const calls = parseInt(match[5], 10);
    const cost = match[6];

    // Find the breakdown for this agent
    const breakdownStart = section.indexOf(match[0]);
    const nextAgentStart = section.indexOf('**', breakdownStart + match[0].length);
    const breakdownSection = section.slice(
      breakdownStart,
      nextAgentStart > 0 ? nextAgentStart : undefined
    );

    // Parse input tokens and breakdown
    const inputMatch = breakdownSection.match(/- Input:\s*([\d,]+)/);
    const outputMatch = breakdownSection.match(/- Output:\s*([\d,]+)/);
    const inputTokens = inputMatch ? parseNumber(inputMatch[1]) : 0;
    const outputTokens = outputMatch ? parseNumber(outputMatch[1]) : 0;

    // Parse input breakdown
    const inputBreakdown = parseBreakdown(breakdownSection, 'Input Breakdown');
    const outputBreakdown = parseBreakdown(breakdownSection, 'Output Breakdown');

    agents.push({
      name: agentName,
      model: modelInfo,
      tokens,
      percentage,
      calls,
      cost,
      inputTokens,
      outputTokens,
      inputBreakdown,
      outputBreakdown,
    });
  }

  return agents;
}

/**
 * Parse a token breakdown section.
 */
function parseBreakdown(
  text: string,
  sectionName: string
): Record<string, { tokens: number; percent: number }> {
  const breakdown: Record<string, { tokens: number; percent: number }> = {};

  // Find the breakdown section
  const sectionMatch = text.match(
    new RegExp(`${sectionName}:[\\s\\S]*?(?=\\n  -|\\n\\*\\*|$)`)
  );
  if (!sectionMatch) return breakdown;

  // Match lines like: - category: X,XXX (YY.Y%)
  const linePattern = /- (\S+):\s*([\d,]+)\s*\(([\d.]+)%\)/g;
  let match;
  while ((match = linePattern.exec(sectionMatch[0])) !== null) {
    breakdown[match[1]] = {
      tokens: parseNumber(match[2]),
      percent: parseFloat(match[3]),
    };
  }

  return breakdown;
}

/**
 * Parse step-by-step analysis.
 */
function parseStepAnalysis(reportText: string): ParsedStep[] {
  const steps: ParsedStep[] = [];

  // Find the Step-by-Step Analysis section
  const sectionMatch = reportText.match(
    /## Step-by-Step Analysis[\s\S]*?(?=\n## |$)/
  );
  if (!sectionMatch) return steps;

  const section = sectionMatch[0];

  // Match step entries: - **agent** step N: X in / Y out [+delta] — ~$cost [HH:MM:SS.mmm]
  const stepPattern = /- \*\*(\S+)\*\*\s*step\s*(\d+):\s*([\d,]+)\s*in\s*\/\s*([\d,]+)\s*out(?:\s*\(([^)]+)\))?\s*—\s*~?(\$[\d.]+)\s*\[(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]/g;

  let match;
  while ((match = stepPattern.exec(section)) !== null) {
    const stepStart = match.index;
    const nextStepMatch = section.slice(stepStart + match[0].length).match(/\n- \*\*/);
    const stepEnd = nextStepMatch
      ? stepStart + match[0].length + (nextStepMatch.index ?? 0)
      : section.length;
    const stepSection = section.slice(stepStart, stepEnd);

    // Parse breakdown for this step
    const breakdown: Record<string, number> = {};
    const breakdownPattern = /\n\s+- (\S+):\s*([\d,]+)/g;
    let breakdownMatch;
    while ((breakdownMatch = breakdownPattern.exec(stepSection)) !== null) {
      breakdown[breakdownMatch[1]] = parseNumber(breakdownMatch[2]);
    }

    steps.push({
      agent: match[1],
      stepNumber: parseInt(match[2], 10),
      inputTokens: parseNumber(match[3]),
      outputTokens: parseNumber(match[4]),
      delta: match[5],
      cost: match[6],
      timestamp: match[7],
      breakdown,
    });
  }

  return steps;
}

/**
 * Parse provider vs internal tracking delta.
 */
function parseTrackingDelta(reportText: string): ParsedUsageReport['trackingDelta'] | undefined {
  // Find the section
  const sectionMatch = reportText.match(
    /## Provider vs Internal Usage Totals[\s\S]*?(?=\n## |$)/
  );
  if (!sectionMatch) return undefined;

  const section = sectionMatch[0];

  // Parse values
  const internalMatch = section.match(/- Internal:\s*([\d,]+)\s*input\s*\/\s*([\d,]+)\s*output/);
  const providerMatch = section.match(/- Provider:\s*([\d,]+)\s*input\s*\/\s*([\d,]+)\s*output/);
  const deltaMatch = section.match(/- Delta:\s*([+-]?[\d,]+)\s*input\s*\/\s*([+-]?[\d,]+)\s*output\s*\(([\d.]+)%\)/);

  if (!internalMatch || !providerMatch) return undefined;

  return {
    internal: {
      input: parseNumber(internalMatch[1]),
      output: parseNumber(internalMatch[2]),
    },
    provider: {
      input: parseNumber(providerMatch[1]),
      output: parseNumber(providerMatch[2]),
    },
    delta: {
      input: deltaMatch ? parseInt(deltaMatch[1].replace(/,/g, ''), 10) : 0,
      output: deltaMatch ? parseInt(deltaMatch[2].replace(/,/g, ''), 10) : 0,
    },
    percent: deltaMatch ? parseFloat(deltaMatch[3]) : 0,
  };
}

/**
 * Parse play-by-play section.
 */
function parsePlayByPlay(reportText: string): ParsedUsageReport['playByPlay'] | undefined {
  // Find the Play-by-Play section
  const sectionMatch = reportText.match(/## Play-by-Play[\s\S]*?(?=\n## |$)/);
  if (!sectionMatch) return undefined;

  const section = sectionMatch[0];

  // Split into History and Current sections
  const historyMatch = section.match(/### History[\s\S]*?(?=\n### |$)/);
  const currentMatch = section.match(/### This Request[\s\S]*?(?=\n## |$)/);

  const history = historyMatch ? parsePlayByPlayEvents(historyMatch[0]) : [];
  const current = currentMatch ? parsePlayByPlayEvents(currentMatch[0]) : [];

  if (history.length === 0 && current.length === 0) return undefined;

  return { history, current };
}

/**
 * Parse individual play-by-play events.
 */
function parsePlayByPlayEvents(text: string): ParsedPlayByPlayEvent[] {
  const events: ParsedPlayByPlayEvent[] = [];

  // Match user messages: - **User**: message
  const userPattern = /- \*\*User\*\*:\s*(.+?)(?=\n|$)/g;
  let match;
  while ((match = userPattern.exec(text)) !== null) {
    events.push({ type: 'user', text: match[1].trim() });
  }

  // Match assistant messages: - **Assistant**: message
  const assistantPattern = /- \*\*Assistant\*\*:\s*(.+?)(?=\n-|$)/gs;
  while ((match = assistantPattern.exec(text)) !== null) {
    events.push({ type: 'assistant', text: match[1].trim() });
  }

  // Match router to agent: - **Router → agent**: message
  const routerToAgentPattern = /- \*\*Router\s*→\s*(\S+)\*\*:\s*(.+?)(?=\n|$)/g;
  while ((match = routerToAgentPattern.exec(text)) !== null) {
    events.push({
      type: 'router-to-agent',
      agent: match[1],
      text: match[2].trim(),
    });
  }

  // Match agent to router: - **agent → Router**: message
  const agentToRouterPattern = /- \*\*(\S+)\s*→\s*Router\*\*:\s*(.+?)(?=\n|$)/g;
  while ((match = agentToRouterPattern.exec(text)) !== null) {
    events.push({
      type: 'agent-to-router',
      agent: match[1],
      text: match[2].trim(),
    });
  }

  // Match tool calls: - tool-call `toolName`:
  const toolCallPattern = /- (?:\*\*\S+\*\*\s*)?tool-call\s*`(\S+)`:\s*```json\s*([\s\S]*?)```/g;
  while ((match = toolCallPattern.exec(text)) !== null) {
    let args: unknown;
    try {
      args = JSON.parse(match[2].trim());
    } catch {
      args = match[2].trim();
    }
    events.push({
      type: 'tool-call',
      toolName: match[1],
      toolArgs: args,
    });
  }

  // Match tool results: - tool-result `toolName`:
  const toolResultPattern = /- (?:\*\*\S+\*\*\s*)?tool-result\s*`(\S+)`:\s*```json\s*([\s\S]*?)```/g;
  while ((match = toolResultPattern.exec(text)) !== null) {
    let result: unknown;
    try {
      result = JSON.parse(match[2].trim());
    } catch {
      result = match[2].trim();
    }
    events.push({
      type: 'tool-result',
      toolName: match[1],
      toolResult: result,
    });
  }

  // Match agent steps: - **agent** step N: message
  const agentStepPattern = /- \*\*(\S+)\*\*\s*step\s*\d+:\s*(.+?)(?=\n|$)/g;
  while ((match = agentStepPattern.exec(text)) !== null) {
    events.push({
      type: 'agent-step',
      agent: match[1],
      text: match[2].trim(),
    });
  }

  return events;
}

// =============================================================================
// Utilities (Exported)
// =============================================================================

/**
 * Clear the tmux scrollback buffer for a session.
 * Call before running a step to get step-specific logs.
 */
export function clearTmuxBuffer(sessionName: string): void {
  if (!hasSession(sessionName)) {
    return;
  }

  try {
    execSync(`tmux clear-history -t "${sessionName}"`, {
      stdio: 'pipe',
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Directly capture logs from a tmux session.
 * Useful for ad-hoc log capture outside of failure context.
 */
export function captureTmuxLogs(
  sessionName: string,
  lines: number = 100
): string {
  return captureLogs(sessionName, lines);
}

/**
 * Check if a tmux session exists.
 */
export function hasTmuxSession(sessionName: string): boolean {
  return hasSession(sessionName);
}
