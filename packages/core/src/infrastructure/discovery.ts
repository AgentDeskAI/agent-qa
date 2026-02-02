/**
 * Resource Discovery
 *
 * Discovers AgentQA resources by naming convention, not just registry.
 * Used for reliable cleanup of orphaned resources.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  INFRASTRUCTURE_CONFIG,
  isAgentQAContainer,
  isAgentQATmuxSession,
  isAgentQAComposeProject,
} from './config.js';

/**
 * Discovered Docker container.
 */
export interface DiscoveredContainer {
  name: string;
  id: string;
  state: 'running' | 'exited' | 'created' | 'paused' | string;
  image: string;
}

/**
 * Discovered tmux session.
 */
export interface DiscoveredTmuxSession {
  name: string;
  windows: number;
  created: Date | null;
}

/**
 * Discovered Docker Compose project.
 */
export interface DiscoveredComposeProject {
  name: string;
  configFiles: string[];
  status: string;
}

/**
 * Discovered FRP process.
 */
export interface DiscoveredFrpProcess {
  pid: number;
  command: string;
  configPath?: string;
}

/**
 * All discovered AgentQA resources.
 */
export interface DiscoveredResources {
  containers: DiscoveredContainer[];
  tmuxSessions: DiscoveredTmuxSession[];
  composeProjects: DiscoveredComposeProject[];
  frpProcesses: DiscoveredFrpProcess[];
  stateFiles: string[];
}

/**
 * Execute a command and return stdout, or null on failure.
 */
function execSafe(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { stdio: 'pipe' }).toString();
  } catch {
    return null;
  }
}

/**
 * Discover all Docker containers with AgentQA naming pattern.
 */
export async function discoverAgentQAContainers(): Promise<DiscoveredContainer[]> {
  const prefix = INFRASTRUCTURE_CONFIG.containerPrefix;

  // Use docker ps to find containers matching our naming pattern
  const output = execSafe('docker', [
    'ps', '-a',
    '--filter', `name=${prefix}-`,
    '--format', '{{.Names}}\t{{.ID}}\t{{.State}}\t{{.Image}}',
  ]);

  if (!output) {
    return [];
  }

  const containers: DiscoveredContainer[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const [name, id, state, image] = line.split('\t');
    if (name && isAgentQAContainer(name)) {
      containers.push({ name, id, state, image });
    }
  }

  // Also check for legacy naming patterns (pocketcoach-agentqa-*)
  const legacyOutput = execSafe('docker', [
    'ps', '-a',
    '--filter', 'name=pocketcoach-agentqa-',
    '--format', '{{.Names}}\t{{.ID}}\t{{.State}}\t{{.Image}}',
  ]);

  if (legacyOutput) {
    const legacyLines = legacyOutput.trim().split('\n').filter(Boolean);
    for (const line of legacyLines) {
      const [name, id, state, image] = line.split('\t');
      if (name && !containers.some((c) => c.name === name)) {
        containers.push({ name, id, state, image });
      }
    }
  }

  return containers;
}

/**
 * Discover all tmux sessions with AgentQA naming pattern.
 */
export async function discoverAgentQATmuxSessions(): Promise<DiscoveredTmuxSession[]> {
  // tmux ls returns format: "session-name: N windows (created Mon Jan 1 12:00:00 2024)"
  const output = execSafe('tmux', ['ls']);

  if (!output) {
    return [];
  }

  const sessions: DiscoveredTmuxSession[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    // Parse tmux ls output format
    const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s*(?:\(created\s+(.+)\))?/);
    if (!match) continue;

    const [, name, windowsStr, createdStr] = match;

    // Check if it matches our naming pattern or legacy pattern
    if (isAgentQATmuxSession(name) || name.startsWith('pocketcoach-agentqa-')) {
      sessions.push({
        name,
        windows: parseInt(windowsStr, 10),
        created: createdStr ? new Date(createdStr) : null,
      });
    }
  }

  return sessions;
}

/**
 * Discover all Docker Compose projects with AgentQA naming pattern.
 */
export async function discoverAgentQAComposeProjects(): Promise<DiscoveredComposeProject[]> {
  // docker compose ls returns JSON format
  const output = execSafe('docker', ['compose', 'ls', '--format', 'json']);

  if (!output) {
    return [];
  }

  const projects: DiscoveredComposeProject[] = [];

  try {
    const data = JSON.parse(output) as Array<{
      Name: string;
      ConfigFiles: string;
      Status: string;
    }>;

    for (const project of data) {
      // Check if it matches our naming pattern or legacy pattern
      if (isAgentQAComposeProject(project.Name) || project.Name.startsWith('pocketcoach-milvus-agentqa')) {
        projects.push({
          name: project.Name,
          configFiles: project.ConfigFiles.split(',').map((f) => f.trim()),
          status: project.Status,
        });
      }
    }
  } catch {
    // Parsing failed
  }

  return projects;
}

/**
 * Discover all FRP processes related to AgentQA.
 */
export async function discoverAgentQAFrpProcesses(): Promise<DiscoveredFrpProcess[]> {
  // pgrep -af returns PID and full command
  const output = execSafe('pgrep', ['-af', 'frpc.*agentqa']);

  if (!output) {
    return [];
  }

  const processes: DiscoveredFrpProcess[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const [, pidStr, command] = match;
    const pid = parseInt(pidStr, 10);

    // Try to extract config path from command
    const configMatch = command.match(/-c\s+([^\s]+)/);
    const configPath = configMatch ? configMatch[1] : undefined;

    processes.push({
      pid,
      command,
      configPath,
    });
  }

  return processes;
}

/**
 * Discover AgentQA state files in ~/.agent-qa/.
 */
export async function discoverAgentQAStateFiles(): Promise<string[]> {
  const stateDir = join(homedir(), INFRASTRUCTURE_CONFIG.stateDir);

  if (!existsSync(stateDir)) {
    return [];
  }

  const files: string[] = [];

  try {
    const entries = readdirSync(stateDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        files.push(join(stateDir, entry.name));
      } else if (entry.isDirectory() && entry.name.startsWith('instance-')) {
        // Add directory contents
        const instanceDir = join(stateDir, entry.name);
        try {
          const instanceEntries = readdirSync(instanceDir, { withFileTypes: true });
          for (const instanceEntry of instanceEntries) {
            if (instanceEntry.isFile()) {
              files.push(join(instanceDir, instanceEntry.name));
            }
          }
        } catch {
          // Ignore permission errors
        }
        // Also add the directory itself
        files.push(instanceDir);
      }
    }
  } catch {
    // Ignore read errors
  }

  return files;
}

/**
 * Discover all AgentQA resources.
 */
export async function discoverAllResources(): Promise<DiscoveredResources> {
  const [containers, tmuxSessions, composeProjects, frpProcesses, stateFiles] =
    await Promise.all([
      discoverAgentQAContainers(),
      discoverAgentQATmuxSessions(),
      discoverAgentQAComposeProjects(),
      discoverAgentQAFrpProcesses(),
      discoverAgentQAStateFiles(),
    ]);

  return {
    containers,
    tmuxSessions,
    composeProjects,
    frpProcesses,
    stateFiles,
  };
}

/**
 * Check if there are any AgentQA resources running.
 */
export async function hasRunningResources(): Promise<boolean> {
  const resources = await discoverAllResources();

  return (
    resources.containers.some((c) => c.state === 'running') ||
    resources.tmuxSessions.length > 0 ||
    resources.composeProjects.length > 0 ||
    resources.frpProcesses.length > 0
  );
}

/**
 * Get a summary of discovered resources for display.
 */
export function summarizeResources(resources: DiscoveredResources): string[] {
  const lines: string[] = [];

  if (resources.containers.length > 0) {
    lines.push(`Docker containers: ${resources.containers.length}`);
    for (const c of resources.containers) {
      lines.push(`  - ${c.name} (${c.state})`);
    }
  }

  if (resources.tmuxSessions.length > 0) {
    lines.push(`Tmux sessions: ${resources.tmuxSessions.length}`);
    for (const s of resources.tmuxSessions) {
      lines.push(`  - ${s.name} (${s.windows} windows)`);
    }
  }

  if (resources.composeProjects.length > 0) {
    lines.push(`Docker Compose projects: ${resources.composeProjects.length}`);
    for (const p of resources.composeProjects) {
      lines.push(`  - ${p.name} (${p.status})`);
    }
  }

  if (resources.frpProcesses.length > 0) {
    lines.push(`FRP processes: ${resources.frpProcesses.length}`);
    for (const p of resources.frpProcesses) {
      lines.push(`  - PID ${p.pid}`);
    }
  }

  if (resources.stateFiles.length > 0) {
    lines.push(`State files: ${resources.stateFiles.length}`);
  }

  if (lines.length === 0) {
    lines.push('No AgentQA resources found');
  }

  return lines;
}
