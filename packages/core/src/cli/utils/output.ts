/**
 * CLI Output Utilities
 *
 * Helpers for formatted terminal output.
 */

/**
 * ANSI color codes.
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Whether to use colors (can be disabled via NO_COLOR env var).
 */
const useColors = !process.env['NO_COLOR'];

/**
 * Apply color to text.
 */
export function color(colorName: keyof typeof colors, text: string): string {
  if (!useColors) return text;
  return `${colors[colorName]}${text}${colors.reset}`;
}

/**
 * Print success message.
 */
export function success(message: string): void {
  console.log(color('green', `✓ ${message}`));
}

/**
 * Print error message.
 */
export function error(message: string): void {
  console.error(color('red', `✗ ${message}`));
}

/**
 * Print warning message.
 */
export function warning(message: string): void {
  console.log(color('yellow', `⚠ ${message}`));
}

/**
 * Print info message.
 */
export function info(message: string): void {
  console.log(color('cyan', `ℹ ${message}`));
}

/**
 * Print dim/muted text.
 */
export function dim(message: string): void {
  console.log(color('dim', message));
}

/**
 * Print a header.
 */
export function header(text: string): void {
  console.log('');
  console.log(color('bold', text));
  console.log(color('dim', '─'.repeat(Math.min(text.length + 4, 60))));
}

/**
 * Print a divider.
 */
export function divider(): void {
  console.log(color('dim', '─'.repeat(60)));
}

/**
 * Print a table.
 */
export function table(rows: Array<{ [key: string]: string | number | undefined }>): void {
  if (rows.length === 0) return;

  // Get column names
  const columns = Object.keys(rows[0]);

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col] = Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length));
  }

  // Print header
  const headerRow = columns.map((col) => col.padEnd(widths[col])).join('  ');
  console.log(color('bold', headerRow));
  console.log(color('dim', columns.map((col) => '─'.repeat(widths[col])).join('──')));

  // Print rows
  for (const row of rows) {
    const rowStr = columns.map((col) => String(row[col] ?? '').padEnd(widths[col])).join('  ');
    console.log(rowStr);
  }
}

/**
 * Print JSON with optional pretty formatting.
 */
export function json(data: unknown, pretty = true): void {
  console.log(pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
}

/**
 * Print a spinner (for async operations).
 * Returns a stop function.
 */
export function spinner(message: string): () => void {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let stopped = false;

  const interval = setInterval(() => {
    if (stopped) return;
    process.stdout.write(`\r${color('cyan', frames[i])} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    stopped = true;
    clearInterval(interval);
    process.stdout.write('\r' + ' '.repeat(message.length + 4) + '\r');
  };
}

/**
 * Truncate text for display.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format duration in human readable form.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Format token count.
 */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(2)}M`;
}

/**
 * Exit with error.
 */
export function exitWithError(message: string, code = 1): never {
  error(message);
  process.exit(code);
}
