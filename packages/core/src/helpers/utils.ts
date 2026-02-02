/**
 * Shared Utility Functions
 *
 * Common utilities used across the agent-qa framework.
 */

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 *
 * @example
 * // Wait 1 second
 * await sleep(1000);
 *
 * // Wait with exponential backoff
 * await sleep(baseDelay * Math.pow(2, attempt));
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Input Validation
// =============================================================================

/**
 * Pattern for valid identifier names (session names, container names, tunnel names).
 * Allows alphanumeric characters, underscores, and hyphens.
 */
const VALID_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate that a string is a safe identifier (alphanumeric, underscores, hyphens).
 *
 * @param value - The value to validate
 * @param name - The name of the parameter (for error messages)
 * @throws Error if the value contains invalid characters
 *
 * @example
 * validateIdentifier('my-session', 'sessionName'); // OK
 * validateIdentifier('my_container_1', 'containerName'); // OK
 * validateIdentifier('bad; rm -rf /', 'name'); // throws Error
 */
export function validateIdentifier(value: string, name: string): void {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} must be a non-empty string`);
  }

  if (!VALID_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `${name} must contain only alphanumeric characters, underscores, and hyphens. Got: "${value}"`
    );
  }
}

/**
 * Validate that a path is safe (no command injection attempts).
 *
 * This is a basic check that rejects paths with obvious shell metacharacters.
 * For volume mounts and file paths passed to Docker/shell commands.
 *
 * @param value - The path to validate
 * @param name - The name of the parameter (for error messages)
 * @throws Error if the path contains dangerous characters
 *
 * @example
 * validatePath('/data/postgres', 'dataPath'); // OK
 * validatePath('./relative/path', 'dataPath'); // OK
 * validatePath('/path; rm -rf /', 'dataPath'); // throws Error
 */
export function validatePath(value: string, name: string): void {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} must be a non-empty string`);
  }

  // Check for dangerous shell metacharacters
  // Allow: alphanumeric, /, ., _, -, ~, space (will be quoted)
  const dangerousChars = /[;&|`$(){}[\]<>!'"\\*?#]/;
  if (dangerousChars.test(value)) {
    throw new Error(
      `${name} contains potentially dangerous characters. Got: "${value}"`
    );
  }
}

/**
 * Validate that a port number is valid.
 *
 * @param value - The port number to validate
 * @param name - The name of the parameter (for error messages)
 * @throws Error if the port is invalid
 */
export function validatePort(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid port number (1-65535). Got: ${value}`);
  }
}

// =============================================================================
// Shell Escaping
// =============================================================================

/**
 * Escape a string for safe use in shell commands.
 *
 * Uses single quotes to prevent all shell interpretation.
 * Any single quotes in the string are replaced with '\'' (end quote, escaped quote, start quote).
 *
 * @param arg - The argument to escape
 * @returns The escaped argument, wrapped in single quotes
 *
 * @example
 * escapeShellArg('hello world'); // "'hello world'"
 * escapeShellArg("it's fine"); // "'it'\\''s fine'"
 * escapeShellArg('$(rm -rf /)'); // "'$(rm -rf /)'"
 */
export function escapeShellArg(arg: string): string {
  // Single quotes prevent all shell interpretation
  // To include a literal single quote, we: end quote, add escaped quote, start new quote
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Quote a path for safe use in shell commands.
 *
 * Uses double quotes with proper escaping for paths that may contain spaces.
 * Special characters ($, `, \, ", !) are escaped.
 *
 * @param path - The path to quote
 * @returns The quoted path
 *
 * @example
 * quotePath('/path/with spaces'); // '"/path/with spaces"'
 * quotePath('/normal/path'); // '"/normal/path"'
 */
export function quotePath(path: string): string {
  // Escape special characters that have meaning in double quotes
  const escaped = path.replace(/([\\$`"!])/g, '\\$1');
  return `"${escaped}"`;
}
