/**
 * Docker PostgreSQL Helper
 *
 * Start and manage PostgreSQL containers.
 */

import { execFileSync } from 'node:child_process';

import {
  DEFAULT_POSTGRES_PORT,
  DEFAULT_POSTGRES_IMAGE,
  DEFAULT_CONTAINER_NAME,
  DEFAULT_DATABASE_NAME,
  DEFAULT_POSTGRES_USER,
  DEFAULT_POSTGRES_PASSWORD,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_POSTGRES_STARTUP_TIMEOUT_MS,
  CONTAINER_ID_LENGTH,
} from '../constants.js';
import type { DockerPostgresOptions, PostgresInstance, InstanceInfo } from './types.js';
import { validateIdentifier, validatePath, validatePort, sleep } from './utils.js';

/**
 * Default configuration values.
 */
const DEFAULTS: Required<Omit<DockerPostgresOptions, 'dataPath'>> & { dataPath?: string } = {
  port: DEFAULT_POSTGRES_PORT,
  image: DEFAULT_POSTGRES_IMAGE,
  containerName: DEFAULT_CONTAINER_NAME,
  databaseName: DEFAULT_DATABASE_NAME,
  username: DEFAULT_POSTGRES_USER,
  password: DEFAULT_POSTGRES_PASSWORD,
  dataPath: undefined,
  healthCheckInterval: DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  startupTimeout: DEFAULT_POSTGRES_STARTUP_TIMEOUT_MS,
};

/**
 * Execute a docker command safely using execFileSync.
 */
function dockerExec(args: string[]): Buffer | null {
  try {
    return execFileSync('docker', args, { stdio: 'pipe' });
  } catch {
    return null;
  }
}

/**
 * Create a PostgreSQL instance.
 */
function createInstance(
  config: Required<Omit<DockerPostgresOptions, 'dataPath'>> & { dataPath?: string },
  startedAt: Date,
  containerId?: string
): PostgresInstance {
  let stopped = false;

  return {
    async stop(): Promise<void> {
      if (stopped) return;

      dockerExec(['stop', config.containerName]);
      stopped = true;
    },

    async isRunning(): Promise<boolean> {
      if (stopped) return false;

      const output = dockerExec(['inspect', '-f', '{{.State.Running}}', config.containerName]);
      return output?.toString().trim() === 'true';
    },

    getInfo(): InstanceInfo {
      return {
        name: config.containerName,
        type: 'postgres',
        port: config.port,
        url: `postgresql://${config.username}:${config.password}@localhost:${config.port}/${config.databaseName}`,
        containerId,
        startedAt,
      };
    },

    getConnectionUrl(): string {
      return `postgresql://${config.username}:${config.password}@localhost:${config.port}/${config.databaseName}`;
    },

    async waitForReady(timeoutMs?: number): Promise<boolean> {
      const timeout = timeoutMs ?? config.startupTimeout;
      const interval = config.healthCheckInterval;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const result = dockerExec([
          'exec', config.containerName,
          'pg_isready', '-U', config.username, '-d', config.databaseName,
        ]);
        if (result !== null) {
          return true;
        }
        await sleep(interval);
      }

      return false;
    },

    async remove(): Promise<void> {
      await this.stop();
      dockerExec(['rm', config.containerName]);
    },
  };
}

/**
 * Start a PostgreSQL container.
 */
async function start(options: DockerPostgresOptions = {}): Promise<PostgresInstance> {
  const config = { ...DEFAULTS, ...options };

  // Validate inputs to prevent command injection
  validateIdentifier(config.containerName, 'containerName');
  validateIdentifier(config.username, 'username');
  validateIdentifier(config.databaseName, 'databaseName');
  validatePort(config.port, 'port');

  // Validate dataPath if provided
  if (config.dataPath) {
    validatePath(config.dataPath, 'dataPath');
  }

  // Check if container is already running
  const runningOutput = dockerExec(['inspect', '-f', '{{.State.Running}}', config.containerName]);
  if (runningOutput?.toString().trim() === 'true') {
    const idOutput = dockerExec(['inspect', '-f', '{{.Id}}', config.containerName]);
    return createInstance(config, new Date(), idOutput?.toString().trim().slice(0, CONTAINER_ID_LENGTH));
  }

  // Check if container exists but is stopped
  let containerId: string | undefined;
  const idOutput = dockerExec(['inspect', '-f', '{{.Id}}', config.containerName]);

  if (idOutput) {
    containerId = idOutput.toString().trim().slice(0, CONTAINER_ID_LENGTH);

    // Start existing container
    dockerExec(['start', config.containerName]);
  } else {
    // Create new container using execFileSync with array arguments
    const runArgs: string[] = [
      'run', '-d',
      '--name', config.containerName,
      '-p', `${config.port}:5432`,
      '-e', `POSTGRES_USER=${config.username}`,
      '-e', `POSTGRES_PASSWORD=${config.password}`,
      '-e', `POSTGRES_DB=${config.databaseName}`,
    ];

    // Add volume mount if dataPath is specified
    if (config.dataPath) {
      runArgs.push('-v', `${config.dataPath}:/var/lib/postgresql/data`);
    }

    runArgs.push(config.image);

    const output = dockerExec(runArgs);
    containerId = output?.toString().trim().slice(0, CONTAINER_ID_LENGTH);
  }

  return createInstance(config, new Date(), containerId);
}

/**
 * Check if a PostgreSQL container is running.
 */
async function isRunning(containerName = DEFAULTS.containerName): Promise<boolean> {
  // Validate container name
  validateIdentifier(containerName, 'containerName');

  const output = dockerExec(['inspect', '-f', '{{.State.Running}}', containerName]);
  return output?.toString().trim() === 'true';
}

/**
 * Stop a PostgreSQL container.
 */
async function stop(containerName = DEFAULTS.containerName): Promise<void> {
  // Validate container name
  validateIdentifier(containerName, 'containerName');

  dockerExec(['stop', containerName]);
}

/**
 * Docker PostgreSQL helper.
 */
export const dockerPostgres = {
  start,
  stop,
  isRunning,
};
