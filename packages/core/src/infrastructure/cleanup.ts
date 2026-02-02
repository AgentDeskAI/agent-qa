/**
 * Resource Cleanup
 *
 * Provides reliable cleanup of AgentQA resources.
 * Uses discovery to find orphaned resources.
 */

import { execFileSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { INFRASTRUCTURE_CONFIG } from './config.js';
import {
  discoverAgentQAContainers,
  discoverAgentQATmuxSessions,
  discoverAgentQAComposeProjects,
  discoverAgentQAFrpProcesses,
  discoverAgentQAStateFiles,
  type DiscoveredResources,
} from './discovery.js';
import { getInstanceRegistry } from './instance-registry.js';

/**
 * Options for cleanup operations.
 */
export interface CleanupOptions {
  /** Only show what would be cleaned up, don't actually do it */
  dryRun?: boolean;
  /** Print verbose output */
  verbose?: boolean;
  /** Callback for logging */
  onLog?: (message: string) => void;
}

/**
 * Result of a cleanup operation.
 */
export interface CleanupResult {
  /** Number of containers stopped/removed */
  containersRemoved: number;
  /** Number of tmux sessions killed */
  tmuxSessionsKilled: number;
  /** Number of compose projects stopped */
  composeProjectsStopped: number;
  /** Number of FRP processes killed */
  frpProcessesKilled: number;
  /** Number of state files removed */
  stateFilesRemoved: number;
  /** Any errors encountered */
  errors: string[];
}

/**
 * Execute a command safely, returning success status.
 */
function execSafe(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop and remove Docker containers.
 */
async function cleanupContainers(
  options: CleanupOptions
): Promise<{ removed: number; errors: string[] }> {
  const log = options.onLog ?? console.log;
  const containers = await discoverAgentQAContainers();
  let removed = 0;
  const errors: string[] = [];

  for (const container of containers) {
    if (options.verbose) {
      log(`  Stopping container: ${container.name} (${container.state})`);
    }

    if (options.dryRun) {
      removed++;
      continue;
    }

    // Stop if running
    if (container.state === 'running') {
      if (!execSafe('docker', ['stop', container.name])) {
        errors.push(`Failed to stop container: ${container.name}`);
        continue;
      }
    }

    // Remove container
    if (execSafe('docker', ['rm', '-f', container.name])) {
      removed++;
    } else {
      errors.push(`Failed to remove container: ${container.name}`);
    }
  }

  return { removed, errors };
}

/**
 * Kill tmux sessions.
 */
async function cleanupTmuxSessions(
  options: CleanupOptions
): Promise<{ killed: number; errors: string[] }> {
  const log = options.onLog ?? console.log;
  const sessions = await discoverAgentQATmuxSessions();
  let killed = 0;
  const errors: string[] = [];

  for (const session of sessions) {
    if (options.verbose) {
      log(`  Killing tmux session: ${session.name}`);
    }

    if (options.dryRun) {
      killed++;
      continue;
    }

    if (execSafe('tmux', ['kill-session', '-t', session.name])) {
      killed++;
    } else {
      errors.push(`Failed to kill tmux session: ${session.name}`);
    }
  }

  return { killed, errors };
}

/**
 * Stop Docker Compose projects.
 */
async function cleanupComposeProjects(
  options: CleanupOptions
): Promise<{ stopped: number; errors: string[] }> {
  const log = options.onLog ?? console.log;
  const projects = await discoverAgentQAComposeProjects();
  let stopped = 0;
  const errors: string[] = [];

  for (const project of projects) {
    if (options.verbose) {
      log(`  Stopping compose project: ${project.name}`);
    }

    if (options.dryRun) {
      stopped++;
      continue;
    }

    // Use docker compose down with project name
    if (execSafe('docker', ['compose', '-p', project.name, 'down', '--remove-orphans'])) {
      stopped++;
    } else {
      errors.push(`Failed to stop compose project: ${project.name}`);
    }
  }

  return { stopped, errors };
}

/**
 * Kill FRP tunnel processes.
 */
async function cleanupFrpProcesses(
  options: CleanupOptions
): Promise<{ killed: number; errors: string[] }> {
  const log = options.onLog ?? console.log;
  const processes = await discoverAgentQAFrpProcesses();
  let killed = 0;
  const errors: string[] = [];

  for (const proc of processes) {
    if (options.verbose) {
      log(`  Killing FRP process: PID ${proc.pid}`);
    }

    if (options.dryRun) {
      killed++;
      continue;
    }

    try {
      // Try graceful shutdown first
      process.kill(proc.pid, 'SIGTERM');

      // Give it a moment
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Force kill if still running
      try {
        process.kill(proc.pid, 0); // Check if alive
        process.kill(proc.pid, 'SIGKILL');
      } catch {
        // Already dead
      }

      killed++;
    } catch {
      errors.push(`Failed to kill FRP process: PID ${proc.pid}`);
    }
  }

  return { killed, errors };
}

/**
 * Remove state files.
 */
async function cleanupStateFiles(
  options: CleanupOptions
): Promise<{ removed: number; errors: string[] }> {
  const log = options.onLog ?? console.log;
  const files = await discoverAgentQAStateFiles();
  let removed = 0;
  const errors: string[] = [];

  // Sort by length descending to remove nested files first
  const sortedFiles = [...files].sort((a, b) => b.length - a.length);

  for (const file of sortedFiles) {
    if (options.verbose) {
      log(`  Removing: ${file}`);
    }

    if (options.dryRun) {
      removed++;
      continue;
    }

    try {
      rmSync(file, { recursive: true, force: true });
      removed++;
    } catch {
      errors.push(`Failed to remove: ${file}`);
    }
  }

  return { removed, errors };
}

/**
 * Clean up all AgentQA resources.
 *
 * Order of operations:
 * 1. Stop tmux sessions (API servers)
 * 2. Kill FRP tunnel processes
 * 3. Stop Docker Compose projects (Milvus)
 * 4. Stop and remove Docker containers (PostgreSQL)
 * 5. Clean up state files
 * 6. Clear instance registry
 */
export async function cleanupAllResources(
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const log = options.onLog ?? console.log;
  const result: CleanupResult = {
    containersRemoved: 0,
    tmuxSessionsKilled: 0,
    composeProjectsStopped: 0,
    frpProcessesKilled: 0,
    stateFilesRemoved: 0,
    errors: [],
  };

  // 1. Stop tmux sessions (API servers)
  if (options.verbose) {
    log('Stopping tmux sessions...');
  }
  const tmuxResult = await cleanupTmuxSessions(options);
  result.tmuxSessionsKilled = tmuxResult.killed;
  result.errors.push(...tmuxResult.errors);

  // 2. Kill FRP tunnel processes
  if (options.verbose) {
    log('Killing FRP processes...');
  }
  const frpResult = await cleanupFrpProcesses(options);
  result.frpProcessesKilled = frpResult.killed;
  result.errors.push(...frpResult.errors);

  // 3. Stop Docker Compose projects (Milvus)
  if (options.verbose) {
    log('Stopping Docker Compose projects...');
  }
  const composeResult = await cleanupComposeProjects(options);
  result.composeProjectsStopped = composeResult.stopped;
  result.errors.push(...composeResult.errors);

  // 4. Stop and remove Docker containers (PostgreSQL)
  if (options.verbose) {
    log('Removing Docker containers...');
  }
  const containerResult = await cleanupContainers(options);
  result.containersRemoved = containerResult.removed;
  result.errors.push(...containerResult.errors);

  // 5. Clean up state files
  if (options.verbose) {
    log('Removing state files...');
  }
  const stateResult = await cleanupStateFiles(options);
  result.stateFilesRemoved = stateResult.removed;
  result.errors.push(...stateResult.errors);

  // 6. Clear instance registry
  if (!options.dryRun) {
    try {
      const registry = getInstanceRegistry();
      await registry.clear();
    } catch (error) {
      result.errors.push(
        `Failed to clear registry: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Clean up resources for a specific instance.
 */
export async function cleanupInstance(
  instanceId: number,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const log = options.onLog ?? console.log;
  const result: CleanupResult = {
    containersRemoved: 0,
    tmuxSessionsKilled: 0,
    composeProjectsStopped: 0,
    frpProcessesKilled: 0,
    stateFilesRemoved: 0,
    errors: [],
  };

  const prefix = INFRASTRUCTURE_CONFIG.containerPrefix;
  const instancePrefix = `${prefix}-${instanceId}`;

  // 1. Stop tmux session for this instance
  const tmuxSession = `${instancePrefix}-api`;
  if (options.verbose) {
    log(`Stopping tmux session: ${tmuxSession}`);
  }
  if (!options.dryRun) {
    if (execSafe('tmux', ['kill-session', '-t', tmuxSession])) {
      result.tmuxSessionsKilled++;
    }
  } else {
    result.tmuxSessionsKilled++;
  }

  // 2. Stop Docker Compose project for this instance
  const composeProject = `${instancePrefix}-milvus`;
  if (options.verbose) {
    log(`Stopping compose project: ${composeProject}`);
  }
  if (!options.dryRun) {
    if (execSafe('docker', ['compose', '-p', composeProject, 'down', '--remove-orphans'])) {
      result.composeProjectsStopped++;
    }
  } else {
    result.composeProjectsStopped++;
  }

  // 3. Stop containers for this instance
  const dbContainer = `${instancePrefix}-db`;
  const milvusContainer = `${instancePrefix}-milvus`;

  for (const container of [dbContainer, milvusContainer]) {
    if (options.verbose) {
      log(`Removing container: ${container}`);
    }
    if (!options.dryRun) {
      execSafe('docker', ['stop', container]);
      if (execSafe('docker', ['rm', '-f', container])) {
        result.containersRemoved++;
      }
    } else {
      result.containersRemoved++;
    }
  }

  // 4. Clean up instance state directory
  const stateDir = join(homedir(), INFRASTRUCTURE_CONFIG.stateDir, `instance-${instanceId}`);
  if (existsSync(stateDir)) {
    if (options.verbose) {
      log(`Removing state directory: ${stateDir}`);
    }
    if (!options.dryRun) {
      try {
        rmSync(stateDir, { recursive: true, force: true });
        result.stateFilesRemoved++;
      } catch (error) {
        result.errors.push(
          `Failed to remove state directory: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      result.stateFilesRemoved++;
    }
  }

  // 5. Release instance from registry
  if (!options.dryRun) {
    try {
      const registry = getInstanceRegistry();
      await registry.release(instanceId);
    } catch (error) {
      result.errors.push(
        `Failed to release instance from registry: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Get a human-readable summary of cleanup results.
 */
export function formatCleanupResult(result: CleanupResult): string[] {
  const lines: string[] = [];

  if (result.tmuxSessionsKilled > 0) {
    lines.push(`Tmux sessions killed: ${result.tmuxSessionsKilled}`);
  }
  if (result.frpProcessesKilled > 0) {
    lines.push(`FRP processes killed: ${result.frpProcessesKilled}`);
  }
  if (result.composeProjectsStopped > 0) {
    lines.push(`Compose projects stopped: ${result.composeProjectsStopped}`);
  }
  if (result.containersRemoved > 0) {
    lines.push(`Containers removed: ${result.containersRemoved}`);
  }
  if (result.stateFilesRemoved > 0) {
    lines.push(`State files removed: ${result.stateFilesRemoved}`);
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }

  if (lines.length === 0) {
    lines.push('No resources to clean up');
  }

  return lines;
}

/**
 * Check if cleanup is needed (any resources exist).
 */
export async function needsCleanup(): Promise<boolean> {
  const [containers, sessions, projects, processes] = await Promise.all([
    discoverAgentQAContainers(),
    discoverAgentQATmuxSessions(),
    discoverAgentQAComposeProjects(),
    discoverAgentQAFrpProcesses(),
  ]);

  return (
    containers.length > 0 ||
    sessions.length > 0 ||
    projects.length > 0 ||
    processes.length > 0
  );
}
