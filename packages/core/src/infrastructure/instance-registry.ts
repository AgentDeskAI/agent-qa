/**
 * Instance Registry
 *
 * Manages AgentQA instance slots with file-based persistence and locking.
 * Ensures multiple `agentqa run` invocations don't conflict.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import lockfile from 'proper-lockfile';

import {
  INFRASTRUCTURE_CONFIG,
  calculateInstancePorts,
  type InstancePorts,
} from './config.js';

/**
 * Information about a registered instance.
 */
export interface InstanceInfo {
  /** Instance slot ID (0, 1, 2, etc.) */
  id: number;
  /** Allocated ports */
  ports: InstancePorts;
  /** Process ID that owns this instance */
  pid: number;
  /** Timestamp when the instance was started */
  startedAt: string;
  /** Optional description of what's running */
  description?: string;
}

/**
 * Registry state stored in instances.json.
 */
interface RegistryState {
  instances: Record<string, InstanceInfo>;
  lastModified: string;
}

/**
 * Result of acquiring an instance slot.
 */
export interface AcquireResult {
  instanceId: number;
  ports: InstancePorts;
  stateDir: string;
}

/**
 * Get the path to the registry state file.
 */
function getRegistryPath(): string {
  return join(homedir(), INFRASTRUCTURE_CONFIG.stateDir, 'instances.json');
}

/**
 * Get the path to the state directory for an instance.
 */
export function getInstanceStateDir(instanceId: number): string {
  return join(homedir(), INFRASTRUCTURE_CONFIG.stateDir, `instance-${instanceId}`);
}

/**
 * Ensure the state directory exists.
 */
function ensureStateDir(): string {
  const stateDir = join(homedir(), INFRASTRUCTURE_CONFIG.stateDir);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

/**
 * Read the registry state from disk.
 */
function readRegistry(): RegistryState {
  const registryPath = getRegistryPath();

  if (!existsSync(registryPath)) {
    return {
      instances: {},
      lastModified: new Date().toISOString(),
    };
  }

  try {
    const content = readFileSync(registryPath, 'utf-8');
    return JSON.parse(content) as RegistryState;
  } catch {
    // Corrupted file, start fresh
    return {
      instances: {},
      lastModified: new Date().toISOString(),
    };
  }
}

/**
 * Write the registry state to disk.
 */
function writeRegistry(state: RegistryState): void {
  const registryPath = getRegistryPath();
  state.lastModified = new Date().toISOString();
  writeFileSync(registryPath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Check if a process is still running.
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill but checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an instance is stale (process dead or timeout exceeded).
 */
function isInstanceStale(instance: InstanceInfo): boolean {
  // Check if the owning process is still alive
  if (!isProcessAlive(instance.pid)) {
    return true;
  }

  // Check if the instance has exceeded the stale timeout
  const startTime = new Date(instance.startedAt).getTime();
  const now = Date.now();
  if (now - startTime > INFRASTRUCTURE_CONFIG.staleInstanceTimeout) {
    return true;
  }

  return false;
}

/**
 * Find the next available instance slot.
 * Returns -1 if no slots are available.
 */
function findAvailableSlot(state: RegistryState): number {
  const maxInstances = INFRASTRUCTURE_CONFIG.maxInstances;

  for (let i = 0; i < maxInstances; i++) {
    const existing = state.instances[String(i)];
    if (!existing || isInstanceStale(existing)) {
      return i;
    }
  }

  return -1;
}

/**
 * Instance Registry class for managing AgentQA instances.
 */
export class InstanceRegistry {
  private lockAcquired = false;
  private releaseLock: (() => Promise<void>) | null = null;

  /**
   * Acquire a file lock on the registry.
   */
  private async acquireLock(): Promise<void> {
    if (this.lockAcquired) return;

    const stateDir = ensureStateDir();
    const registryPath = getRegistryPath();

    // Create empty file if it doesn't exist (lockfile requires existing file)
    if (!existsSync(registryPath)) {
      writeFileSync(registryPath, JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));
    }

    try {
      this.releaseLock = await lockfile.lock(registryPath, {
        stale: 10000, // Consider lock stale after 10s
        retries: {
          retries: 5,
          factor: 2,
          minTimeout: 100,
          maxTimeout: 1000,
        },
      });
      this.lockAcquired = true;
    } catch (error) {
      throw new Error(
        `Failed to acquire lock on instance registry: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Release the file lock.
   */
  private async releaseLockIfHeld(): Promise<void> {
    if (this.releaseLock) {
      try {
        await this.releaseLock();
      } catch {
        // Ignore release errors
      }
      this.releaseLock = null;
      this.lockAcquired = false;
    }
  }

  /**
   * Acquire an instance slot.
   * Returns the instance ID, ports, and state directory.
   * Throws if no slots are available.
   */
  async acquire(description?: string): Promise<AcquireResult> {
    await this.acquireLock();

    try {
      const state = readRegistry();

      // Find an available slot (may be a stale one)
      const slotId = findAvailableSlot(state);
      if (slotId === -1) {
        throw new Error(
          `No available AgentQA instance slots. Max instances: ${INFRASTRUCTURE_CONFIG.maxInstances}. ` +
          `Use 'agentqa teardown --all' to clean up stale instances.`
        );
      }

      // Calculate ports for this slot
      const ports = calculateInstancePorts(slotId);

      // Register this instance
      state.instances[String(slotId)] = {
        id: slotId,
        ports,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        description,
      };

      writeRegistry(state);

      // Ensure instance state directory exists
      const stateDir = getInstanceStateDir(slotId);
      if (!existsSync(stateDir)) {
        mkdirSync(stateDir, { recursive: true });
      }

      return {
        instanceId: slotId,
        ports,
        stateDir,
      };
    } finally {
      await this.releaseLockIfHeld();
    }
  }

  /**
   * Release an instance slot.
   */
  async release(instanceId: number): Promise<void> {
    await this.acquireLock();

    try {
      const state = readRegistry();
      delete state.instances[String(instanceId)];
      writeRegistry(state);
    } finally {
      await this.releaseLockIfHeld();
    }
  }

  /**
   * Get all registered instances.
   */
  async getAll(): Promise<InstanceInfo[]> {
    await this.acquireLock();

    try {
      const state = readRegistry();
      return Object.values(state.instances);
    } finally {
      await this.releaseLockIfHeld();
    }
  }

  /**
   * Get active (non-stale) instances.
   */
  async getActive(): Promise<InstanceInfo[]> {
    const all = await this.getAll();
    return all.filter((instance) => !isInstanceStale(instance));
  }

  /**
   * Get stale instances (dead process or timeout).
   */
  async getStale(): Promise<InstanceInfo[]> {
    const all = await this.getAll();
    return all.filter((instance) => isInstanceStale(instance));
  }

  /**
   * Clean up stale instances from the registry.
   * Returns the number of instances removed.
   */
  async cleanStale(): Promise<number> {
    await this.acquireLock();

    try {
      const state = readRegistry();
      let removed = 0;

      for (const [id, instance] of Object.entries(state.instances)) {
        if (isInstanceStale(instance)) {
          delete state.instances[id];
          removed++;
        }
      }

      if (removed > 0) {
        writeRegistry(state);
      }

      return removed;
    } finally {
      await this.releaseLockIfHeld();
    }
  }

  /**
   * Clear all instances from the registry.
   */
  async clear(): Promise<void> {
    await this.acquireLock();

    try {
      writeRegistry({
        instances: {},
        lastModified: new Date().toISOString(),
      });
    } finally {
      await this.releaseLockIfHeld();
    }
  }

  /**
   * Get count of available slots.
   */
  async getAvailableCount(): Promise<number> {
    const active = await this.getActive();
    return INFRASTRUCTURE_CONFIG.maxInstances - active.length;
  }
}

/**
 * Singleton instance of the registry.
 */
let registryInstance: InstanceRegistry | null = null;

/**
 * Get the singleton instance registry.
 */
export function getInstanceRegistry(): InstanceRegistry {
  if (!registryInstance) {
    registryInstance = new InstanceRegistry();
  }
  return registryInstance;
}
