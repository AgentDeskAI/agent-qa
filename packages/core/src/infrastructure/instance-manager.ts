/**
 * Instance Manager
 *
 * Manages the full lifecycle of an AgentQA instance, including
 * infrastructure startup, configuration, and teardown.
 */

import { join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

import {
  calculateInstancePorts,
  getInstanceContainerNames,
  getInstanceTmuxSession,
  getInstanceComposeProject,
  type InstancePorts,
} from './config.js';
import {
  getInstanceRegistry,
  getInstanceStateDir,
  type AcquireResult,
} from './instance-registry.js';
import { cleanupInstance } from './cleanup.js';

/**
 * Configuration for an AgentQA instance.
 */
export interface InstanceConfig {
  /** Instance ID (slot number) */
  instanceId: number;
  /** Allocated ports */
  ports: InstancePorts;
  /** Container names */
  containers: {
    db: string;
    milvus: string;
  };
  /** Tmux session name for API server */
  tmuxSession: string;
  /** Docker Compose project name for Milvus */
  composeProject: string;
  /** Path to instance state directory */
  stateDir: string;
  /** Database connection URL */
  databaseUrl: string;
  /** API base URL */
  apiUrl: string;
  /** Milvus connection address */
  milvusAddress: string;
  /** FRP tunnel remote port */
  tunnelPort: number;
}

/**
 * Environment variables for an instance.
 */
export interface InstanceEnv {
  DATABASE_URL: string;
  PORT: string;
  MILVUS_PORT: string;
  MILVUS_ENABLED: string;
  TUNNEL_ENDPOINT?: string;
}

/**
 * Options for creating an instance manager.
 */
export interface InstanceManagerOptions {
  /** Specific instance ID to use (auto-acquire if not provided) */
  instanceId?: number;
  /** Description for the instance registry */
  description?: string;
  /** Database credentials */
  database?: {
    username?: string;
    password?: string;
    databaseName?: string;
  };
}

/**
 * Result of initializing an instance.
 */
export interface InitializeResult {
  config: InstanceConfig;
  env: InstanceEnv;
}

/**
 * Instance Manager class for managing AgentQA instances.
 */
export class InstanceManager {
  private config: InstanceConfig | null = null;
  private acquired = false;

  constructor(private options: InstanceManagerOptions = {}) {}

  /**
   * Initialize the instance by acquiring a slot and generating configuration.
   */
  async initialize(): Promise<InitializeResult> {
    if (this.config) {
      throw new Error('Instance already initialized');
    }

    const registry = getInstanceRegistry();
    let acquireResult: AcquireResult;

    // Acquire a slot (or use the specified instance ID)
    if (this.options.instanceId !== undefined) {
      // Using a specific instance ID - calculate ports directly
      const instanceId = this.options.instanceId;
      const ports = calculateInstancePorts(instanceId);
      const stateDir = getInstanceStateDir(instanceId);

      // Ensure state directory exists
      if (!existsSync(stateDir)) {
        mkdirSync(stateDir, { recursive: true });
      }

      acquireResult = { instanceId, ports, stateDir };
    } else {
      // Auto-acquire an available slot
      acquireResult = await registry.acquire(this.options.description);
      this.acquired = true;
    }

    const { instanceId, ports, stateDir } = acquireResult;

    // Generate container names
    const containers = getInstanceContainerNames(instanceId);
    const tmuxSession = getInstanceTmuxSession(instanceId);
    const composeProject = getInstanceComposeProject(instanceId);

    // Database credentials (with defaults)
    const dbUser = this.options.database?.username ?? 'postgres';
    const dbPass = this.options.database?.password ?? 'postgres';
    const dbName = this.options.database?.databaseName ?? 'pocketcoach_dev';

    // Build configuration
    this.config = {
      instanceId,
      ports,
      containers,
      tmuxSession,
      composeProject,
      stateDir,
      databaseUrl: `postgresql://${dbUser}:${dbPass}@localhost:${ports.db}/${dbName}`,
      apiUrl: `http://localhost:${ports.api}`,
      milvusAddress: `localhost:${ports.milvus}`,
      tunnelPort: ports.tunnel,
    };

    // Build environment variables
    const env: InstanceEnv = {
      DATABASE_URL: this.config.databaseUrl,
      PORT: String(ports.api),
      MILVUS_PORT: String(ports.milvus),
      MILVUS_ENABLED: 'true',
    };

    return { config: this.config, env };
  }

  /**
   * Get the instance configuration.
   */
  getConfig(): InstanceConfig {
    if (!this.config) {
      throw new Error('Instance not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * Generate environment variables for the API server.
   */
  getApiEnv(additionalEnv: Record<string, string> = {}): Record<string, string> {
    const config = this.getConfig();

    return {
      DATABASE_URL: config.databaseUrl,
      PORT: String(config.ports.api),
      MILVUS_PORT: String(config.ports.milvus),
      MILVUS_ENABLED: 'true',
      ...additionalEnv,
    };
  }

  /**
   * Write a Docker Compose file for Milvus to the instance state directory.
   */
  writeMilvusCompose(template: string): string {
    const config = this.getConfig();
    const composePath = join(config.stateDir, 'docker-compose.milvus.yml');

    // Replace port placeholder in the template
    const content = template
      .replace(/\{\{MILVUS_PORT\}\}/g, String(config.ports.milvus))
      .replace(/\{\{INSTANCE_ID\}\}/g, String(config.instanceId))
      .replace(/\{\{CONTAINER_NAME\}\}/g, config.containers.milvus)
      .replace(/\{\{PROJECT_NAME\}\}/g, config.composeProject);

    writeFileSync(composePath, content, 'utf-8');
    return composePath;
  }

  /**
   * Clean up and release the instance.
   */
  async cleanup(options: { verbose?: boolean } = {}): Promise<void> {
    if (!this.config) {
      return;
    }

    await cleanupInstance(this.config.instanceId, {
      verbose: options.verbose,
    });

    this.config = null;
    this.acquired = false;
  }

  /**
   * Release the instance slot without cleaning up resources.
   * Use this when you want to keep resources running but release the registry slot.
   */
  async release(): Promise<void> {
    if (!this.config || !this.acquired) {
      return;
    }

    const registry = getInstanceRegistry();
    await registry.release(this.config.instanceId);
    this.acquired = false;
  }
}

/**
 * Create an instance manager.
 */
export function createInstanceManager(
  options: InstanceManagerOptions = {}
): InstanceManager {
  return new InstanceManager(options);
}

/**
 * Get port configuration for a specific instance ID without acquiring a slot.
 * Useful for utilities that need to reference instance ports.
 */
export function getInstancePorts(instanceId: number): InstancePorts {
  return calculateInstancePorts(instanceId);
}
