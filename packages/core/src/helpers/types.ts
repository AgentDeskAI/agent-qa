/**
 * Helper Types
 *
 * Common types for infrastructure helpers.
 */

/**
 * Generic instance returned by helpers.
 */
export interface Instance {
  /** Stop the running instance */
  stop(): Promise<void>;

  /** Check if the instance is running */
  isRunning(): Promise<boolean>;

  /** Get information about the instance */
  getInfo(): InstanceInfo;
}

/**
 * Information about a running instance.
 */
export interface InstanceInfo {
  /** Name of the instance */
  name: string;

  /** Type of helper (postgres, tmux, compose, etc.) */
  type: string;

  /** Port the instance is listening on (if applicable) */
  port?: number;

  /** URL for the instance (if applicable) */
  url?: string;

  /** Process ID (if applicable) */
  pid?: number;

  /** Container ID (if applicable) */
  containerId?: string;

  /** When the instance was started */
  startedAt?: Date;
}

// =============================================================================
// Docker PostgreSQL
// =============================================================================

/**
 * Options for starting a PostgreSQL container.
 */
export interface DockerPostgresOptions {
  /** Port to expose (default: 5432) */
  port?: number;

  /** Docker image (default: 'postgres:16') */
  image?: string;

  /** Container name (default: 'agent-qa-postgres') */
  containerName?: string;

  /** Database name (default: 'agent_qa') */
  databaseName?: string;

  /** Username (default: 'postgres') */
  username?: string;

  /** Password (default: 'postgres') */
  password?: string;

  /** Optional data path for persistence */
  dataPath?: string;

  /** Health check interval in ms (default: 1000) */
  healthCheckInterval?: number;

  /** Startup timeout in ms (default: 30000) */
  startupTimeout?: number;
}

/**
 * PostgreSQL-specific instance.
 */
export interface PostgresInstance extends Instance {
  /** Get the connection URL */
  getConnectionUrl(): string;

  /** Wait for PostgreSQL to be ready */
  waitForReady(timeoutMs?: number): Promise<boolean>;

  /** Remove the container (for cleanup) */
  remove(): Promise<void>;
}

// =============================================================================
// Tmux Process
// =============================================================================

/**
 * Options for starting a process in tmux.
 */
export interface TmuxProcessOptions {
  /** Tmux session name */
  name: string;

  /** Command to run */
  command: string;

  /** Working directory */
  cwd?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Port to wait for (optional) */
  port?: number;

  /** Health check URL (optional) */
  healthUrl?: string;

  /** Health check endpoint path (default: '/health') */
  healthEndpoint?: string;

  /** Health check interval in ms (default: 1000) */
  healthCheckInterval?: number;

  /** Startup timeout in ms (default: 60000) */
  startupTimeout?: number;
}

/**
 * Tmux-specific instance.
 */
export interface TmuxInstance extends Instance {
  /** Session name */
  readonly sessionName: string;

  /** Wait for the process to be ready */
  waitForReady(timeoutMs?: number): Promise<boolean>;

  /** Get logs from the session */
  getLogs(lines?: number): Promise<string>;

  /** Send a command to the session */
  sendCommand(command: string): void;
}

// =============================================================================
// Docker Compose
// =============================================================================

/**
 * Options for starting a Docker Compose stack.
 */
export interface DockerComposeOptions {
  /** Path to docker-compose.yml file */
  composePath?: string;

  /** Working directory (if composePath is relative) */
  cwd?: string;

  /** Project name (default: 'agent-qa') */
  projectName?: string;

  /** Services to start (default: all) */
  services?: string[];

  /** Startup timeout in ms (default: 60000) */
  startupTimeout?: number;
}

/**
 * Docker Compose-specific instance.
 */
export interface ComposeInstance extends Instance {
  /** Wait for the stack to be ready */
  waitForReady(timeoutMs?: number): Promise<boolean>;

  /** Get logs from a service */
  getLogs(service?: string, lines?: number): Promise<string>;

  /** Get status of services */
  getServices(): Promise<{ name: string; state: string }[]>;
}

// =============================================================================
// FRP Tunnel
// =============================================================================

/**
 * Options for starting an FRP tunnel.
 */
export interface FrpTunnelOptions {
  /** Local port to tunnel */
  localPort: number;

  /** FRP server host */
  serverHost?: string;

  /** Remote port on server (default: auto-assigned) */
  remotePort?: number;

  /** Tunnel name (default: 'agent-qa') */
  tunnelName?: string;

  /** Path to FRP config file (alternative to inline options) */
  configPath?: string;

  /** Path to ensure script (alternative to running frpc directly) */
  ensureScript?: string;
}

/**
 * FRP tunnel-specific instance.
 */
export interface TunnelInstance extends Instance {
  /** Wait for the tunnel to be established */
  waitForReady(timeoutMs?: number): Promise<boolean>;

  /** Get the external URL */
  getExternalUrl(): string;
}
