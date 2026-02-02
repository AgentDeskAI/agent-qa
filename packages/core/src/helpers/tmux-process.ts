/**
 * Tmux Process Helper
 *
 * Start and manage processes in tmux sessions.
 */

import { execFileSync } from 'node:child_process';

import {
  DEFAULT_HEALTH_ENDPOINT,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  DEFAULT_LOG_LINES,
} from '../constants.js';
import type { TmuxProcessOptions, TmuxInstance, InstanceInfo } from './types.js';
import { validateIdentifier, validatePath, escapeShellArg, sleep } from './utils.js';

/**
 * Default configuration values.
 */
const DEFAULTS = {
  healthEndpoint: DEFAULT_HEALTH_ENDPOINT,
  healthCheckInterval: DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  startupTimeout: DEFAULT_STARTUP_TIMEOUT_MS,
};

/**
 * Execute a tmux command safely using execFileSync.
 * Handles stderr redirection by ignoring exit codes.
 */
function tmuxExec(args: string[]): Buffer | null {
  try {
    return execFileSync('tmux', args, { stdio: 'pipe' });
  } catch {
    return null;
  }
}

/**
 * Create a tmux instance.
 */
function createInstance(
  config: TmuxProcessOptions & typeof DEFAULTS,
  startedAt: Date
): TmuxInstance {
  let stopped = false;

  return {
    sessionName: config.name,

    async stop(): Promise<void> {
      if (stopped) return;

      tmuxExec(['kill-session', '-t', config.name]);
      stopped = true;
    },

    async isRunning(): Promise<boolean> {
      if (stopped) return false;

      const result = tmuxExec(['has-session', '-t', config.name]);
      return result !== null;
    },

    getInfo(): InstanceInfo {
      return {
        name: config.name,
        type: 'tmux',
        port: config.port,
        url: config.port ? `http://localhost:${config.port}` : undefined,
        startedAt,
      };
    },

    async waitForReady(timeoutMs?: number): Promise<boolean> {
      const timeout = timeoutMs ?? config.startupTimeout;
      const interval = config.healthCheckInterval;
      const start = Date.now();

      // If we have a health URL or port, wait for it
      const healthUrl = config.healthUrl ?? (config.port
        ? `http://localhost:${config.port}${config.healthEndpoint}`
        : undefined);

      if (healthUrl) {
        while (Date.now() - start < timeout) {
          try {
            const response = await fetch(healthUrl);
            if (response.ok) return true;
          } catch {
            // Not ready yet
          }
          await sleep(interval);
        }
        return false;
      }

      // Just wait for the session to exist
      while (Date.now() - start < timeout) {
        if (await this.isRunning()) {
          return true;
        }
        await sleep(interval);
      }

      return false;
    },

    async getLogs(lines = DEFAULT_LOG_LINES): Promise<string> {
      const result = tmuxExec(['capture-pane', '-t', config.name, '-p', '-S', `-${lines}`]);
      return result?.toString() ?? '';
    },

    sendCommand(command: string): void {
      // Use execFileSync to avoid shell injection
      // tmux send-keys sends each argument as a separate key sequence
      tmuxExec(['send-keys', '-t', config.name, command, 'Enter']);
    },
  };
}

/**
 * Start a process in a tmux session.
 */
async function start(options: TmuxProcessOptions): Promise<TmuxInstance> {
  const config = { ...DEFAULTS, ...options };

  // Validate session name to prevent command injection
  validateIdentifier(config.name, 'sessionName');

  // Validate cwd if provided
  if (config.cwd) {
    validatePath(config.cwd, 'cwd');
  }

  // Check if session already exists
  const hasSession = tmuxExec(['has-session', '-t', config.name]);
  if (hasSession !== null) {
    // Session exists, return an instance for it
    return createInstance(config, new Date());
  }

  // Build the shell command with proper escaping
  // We need to use sh -c because we may need cd and env var handling

  // Build environment variable prefix (ENV=val ENV2=val2 command)
  let commandWithEnv = config.command;
  if (config.env && Object.keys(config.env).length > 0) {
    const envParts = Object.entries(config.env).map(([k, v]) => {
      // Validate env var name (alphanumeric and underscore only)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) {
        throw new Error(`Invalid environment variable name: ${k}`);
      }
      return `${k}=${escapeShellArg(v)}`;
    });
    // Prepend env vars to the command (not separate with &&)
    commandWithEnv = `${envParts.join(' ')} ${config.command}`;
  }

  // Build full command with cd if needed
  const fullCommand = config.cwd
    ? `cd ${escapeShellArg(config.cwd)} && ${commandWithEnv}`
    : commandWithEnv;

  // Start tmux session using execFileSync
  // The command needs to be passed through sh -c for proper handling
  execFileSync('tmux', ['new-session', '-d', '-s', config.name, 'sh', '-c', fullCommand], {
    stdio: 'pipe',
  });

  return createInstance(config, new Date());
}

/**
 * Check if a tmux session exists.
 */
async function isRunning(sessionName: string): Promise<boolean> {
  // Validate session name
  validateIdentifier(sessionName, 'sessionName');

  const result = tmuxExec(['has-session', '-t', sessionName]);
  return result !== null;
}

/**
 * Stop a tmux session.
 */
async function stop(sessionName: string): Promise<void> {
  // Validate session name
  validateIdentifier(sessionName, 'sessionName');

  tmuxExec(['kill-session', '-t', sessionName]);
}

/**
 * Get logs from a tmux session.
 */
async function getLogs(sessionName: string, lines = DEFAULT_LOG_LINES): Promise<string> {
  // Validate session name
  validateIdentifier(sessionName, 'sessionName');

  const result = tmuxExec(['capture-pane', '-t', sessionName, '-p', '-S', `-${lines}`]);
  return result?.toString() ?? '';
}

/**
 * Tmux process helper.
 */
export const tmuxProcess = {
  start,
  stop,
  isRunning,
  getLogs,
};
