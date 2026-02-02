/**
 * Docker Compose Helper
 *
 * Start and manage Docker Compose stacks.
 */

import { execFileSync } from 'node:child_process';

import {
  DEFAULT_COMPOSE_PROJECT_NAME,
  DEFAULT_COMPOSE_STARTUP_TIMEOUT_MS,
  COMPOSE_READINESS_INTERVAL_MS,
  DEFAULT_LOG_LINES,
  DEBUG_TEXT_TRUNCATE_LENGTH,
} from '../constants.js';
import type { DockerComposeOptions, ComposeInstance, InstanceInfo } from './types.js';
import { validateIdentifier, validatePath, sleep } from './utils.js';

/**
 * Default configuration values.
 */
const DEFAULTS = {
  projectName: DEFAULT_COMPOSE_PROJECT_NAME,
  startupTimeout: DEFAULT_COMPOSE_STARTUP_TIMEOUT_MS,
};

/**
 * Verbose flag for logging (passed through instance methods).
 */
let verboseMode = false;

/**
 * Build docker compose arguments as array.
 */
function buildComposeArgs(config: DockerComposeOptions & typeof DEFAULTS): string[] {
  const args: string[] = [];

  if (config.composePath) {
    args.push('-f', config.composePath);
  }

  args.push('-p', config.projectName);

  return args;
}

/**
 * Execute a docker compose command safely.
 */
function composeExec(args: string[], cwd?: string): Buffer | null {
  try {
    return execFileSync('docker', ['compose', ...args], {
      stdio: 'pipe',
      cwd,
    });
  } catch {
    return null;
  }
}

/**
 * Parse container JSON safely with verbose logging.
 */
function parseContainerJson(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    if (verboseMode) {
      console.warn(`[docker-compose] Failed to parse container JSON: ${line.slice(0, DEBUG_TEXT_TRUNCATE_LENGTH)}${line.length > DEBUG_TEXT_TRUNCATE_LENGTH ? '...' : ''}`);
    }
    return null;
  }
}

/**
 * Create a Docker Compose instance.
 */
function createInstance(
  config: DockerComposeOptions & typeof DEFAULTS,
  startedAt: Date
): ComposeInstance {
  let stopped = false;

  return {
    async stop(): Promise<void> {
      if (stopped) return;

      const composeArgs = buildComposeArgs(config);
      composeExec([...composeArgs, 'down'], config.cwd);
      stopped = true;
    },

    async isRunning(): Promise<boolean> {
      if (stopped) return false;

      const composeArgs = buildComposeArgs(config);
      const output = composeExec([...composeArgs, 'ps', '--format', 'json'], config.cwd);

      if (!output) return false;

      const lines = output.toString().trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const container = parseContainerJson(line);
        if (container?.State === 'running') {
          return true;
        }
      }

      return false;
    },

    getInfo(): InstanceInfo {
      return {
        name: config.projectName,
        type: 'compose',
        startedAt,
      };
    },

    async waitForReady(timeoutMs?: number): Promise<boolean> {
      const timeout = timeoutMs ?? config.startupTimeout;
      const interval = COMPOSE_READINESS_INTERVAL_MS;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        if (await this.isRunning()) {
          return true;
        }
        await sleep(interval);
      }

      return false;
    },

    async getLogs(service?: string, lines = DEFAULT_LOG_LINES): Promise<string> {
      const composeArgs = buildComposeArgs(config);
      const logsArgs = [...composeArgs, 'logs', '--tail', String(lines)];

      if (service) {
        logsArgs.push(service);
      }

      const output = composeExec(logsArgs, config.cwd);
      return output?.toString() ?? '';
    },

    async getServices(): Promise<{ name: string; state: string }[]> {
      const composeArgs = buildComposeArgs(config);
      const output = composeExec([...composeArgs, 'ps', '--format', 'json'], config.cwd);

      if (!output) return [];

      const lines = output.toString().trim().split('\n').filter(Boolean);
      const services: { name: string; state: string }[] = [];

      for (const line of lines) {
        const container = parseContainerJson(line);
        if (container) {
          services.push({
            name: String(container.Service || container.Name || 'unknown'),
            state: String(container.State || 'unknown'),
          });
        }
      }

      return services;
    },
  };
}

/**
 * Start a Docker Compose stack.
 */
async function start(options: DockerComposeOptions & { verbose?: boolean } = {}): Promise<ComposeInstance> {
  const config = { ...DEFAULTS, ...options };

  // Set verbose mode for JSON parsing warnings
  verboseMode = options.verbose ?? false;

  // Validate inputs
  validateIdentifier(config.projectName, 'projectName');
  if (config.composePath) {
    validatePath(config.composePath, 'composePath');
  }
  if (config.cwd) {
    validatePath(config.cwd, 'cwd');
  }

  const composeArgs = buildComposeArgs(config);

  // Check if already running
  const output = composeExec([...composeArgs, 'ps', '--format', 'json'], config.cwd);
  if (output) {
    const lines = output.toString().trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const container = parseContainerJson(line);
      if (container?.State === 'running') {
        return createInstance(config, new Date());
      }
    }
  }

  // Start the stack
  const upArgs = [...composeArgs, 'up', '-d'];
  if (config.services && config.services.length > 0) {
    upArgs.push(...config.services);
  }

  execFileSync('docker', ['compose', ...upArgs], {
    stdio: 'pipe',
    cwd: config.cwd,
  });

  return createInstance(config, new Date());
}

/**
 * Stop a Docker Compose stack.
 */
async function stop(options: DockerComposeOptions = {}): Promise<void> {
  const config = { ...DEFAULTS, ...options };

  // Validate inputs
  validateIdentifier(config.projectName, 'projectName');
  if (config.composePath) {
    validatePath(config.composePath, 'composePath');
  }
  if (config.cwd) {
    validatePath(config.cwd, 'cwd');
  }

  const composeArgs = buildComposeArgs(config);
  composeExec([...composeArgs, 'down'], config.cwd);
}

/**
 * Check if a Docker Compose stack is running.
 */
async function isRunning(options: DockerComposeOptions & { verbose?: boolean } = {}): Promise<boolean> {
  const config = { ...DEFAULTS, ...options };

  // Set verbose mode for JSON parsing warnings
  verboseMode = options.verbose ?? false;

  // Validate inputs
  validateIdentifier(config.projectName, 'projectName');
  if (config.composePath) {
    validatePath(config.composePath, 'composePath');
  }
  if (config.cwd) {
    validatePath(config.cwd, 'cwd');
  }

  const composeArgs = buildComposeArgs(config);
  const output = composeExec([...composeArgs, 'ps', '--format', 'json'], config.cwd);

  if (!output) return false;

  const lines = output.toString().trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const container = parseContainerJson(line);
    if (container?.State === 'running') {
      return true;
    }
  }

  return false;
}

/**
 * Docker Compose helper.
 */
export const dockerCompose = {
  start,
  stop,
  isRunning,
};
