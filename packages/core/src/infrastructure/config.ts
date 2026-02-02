/**
 * Infrastructure Configuration
 *
 * Centralized configuration for AgentQA parallel instance management.
 */

/**
 * Default configuration for AgentQA parallelism.
 */
export const INFRASTRUCTURE_CONFIG = {
  /** Maximum number of simultaneous AgentQA instances */
  maxInstances: 5,

  /** Maximum parallel scenarios per instance */
  maxWorkersPerInstance: 8,

  /** Time in ms before considering an instance stale (1 hour) */
  staleInstanceTimeout: 3600000,

  /** Base directory for AgentQA state files */
  stateDir: '.agent-qa',

  /** Port ranges for instance allocation */
  portRanges: {
    /** Database ports starting at 5438 */
    db: { start: 5438, max: 10 },
    /** API ports starting at 4002 */
    api: { start: 4002, max: 10 },
    /** Milvus ports starting at 19532 */
    milvus: { start: 19532, max: 10 },
    /** FRP tunnel ports starting at 6100 */
    tunnel: { start: 6100, max: 10 },
  },

  /** Container naming prefix */
  containerPrefix: 'agentqa',

  /** Tmux session prefix */
  tmuxPrefix: 'agentqa',

  /** Docker Compose project prefix */
  composePrefix: 'agentqa',
} as const;

/**
 * Port allocation for an instance.
 */
export interface InstancePorts {
  db: number;
  api: number;
  milvus: number;
  tunnel: number;
}

/**
 * Calculate ports for a given instance ID.
 */
export function calculateInstancePorts(instanceId: number): InstancePorts {
  const config = INFRASTRUCTURE_CONFIG.portRanges;

  if (instanceId < 0 || instanceId >= config.db.max) {
    throw new Error(
      `Instance ID ${instanceId} out of range (0-${config.db.max - 1})`
    );
  }

  return {
    db: config.db.start + instanceId,
    api: config.api.start + instanceId,
    milvus: config.milvus.start + instanceId,
    tunnel: config.tunnel.start + instanceId,
  };
}

/**
 * Container names for an instance.
 */
export interface InstanceContainerNames {
  db: string;
  milvus: string;
}

/**
 * Get container names for a given instance ID.
 */
export function getInstanceContainerNames(instanceId: number): InstanceContainerNames {
  const prefix = INFRASTRUCTURE_CONFIG.containerPrefix;
  return {
    db: `${prefix}-${instanceId}-db`,
    milvus: `${prefix}-${instanceId}-milvus`,
  };
}

/**
 * Get tmux session name for a given instance ID.
 */
export function getInstanceTmuxSession(instanceId: number): string {
  return `${INFRASTRUCTURE_CONFIG.tmuxPrefix}-${instanceId}-api`;
}

/**
 * Get Docker Compose project name for a given instance ID.
 */
export function getInstanceComposeProject(instanceId: number): string {
  return `${INFRASTRUCTURE_CONFIG.composePrefix}-${instanceId}-milvus`;
}

/**
 * Check if a container name matches the AgentQA naming pattern.
 */
export function isAgentQAContainer(name: string): boolean {
  return name.startsWith(`${INFRASTRUCTURE_CONFIG.containerPrefix}-`);
}

/**
 * Check if a tmux session matches the AgentQA naming pattern.
 */
export function isAgentQATmuxSession(name: string): boolean {
  return name.startsWith(`${INFRASTRUCTURE_CONFIG.tmuxPrefix}-`);
}

/**
 * Check if a Docker Compose project matches the AgentQA naming pattern.
 */
export function isAgentQAComposeProject(name: string): boolean {
  return name.startsWith(`${INFRASTRUCTURE_CONFIG.composePrefix}-`);
}
