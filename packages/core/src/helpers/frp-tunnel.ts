/**
 * FRP Tunnel Helper
 *
 * Start and manage FRP tunnels.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

import {
  DEFAULT_TUNNEL_NAME,
  DEFAULT_FRP_SERVER_PORT,
  DEFAULT_REMOTE_PORT,
  DEFAULT_TUNNEL_READY_TIMEOUT_MS,
  TUNNEL_CHECK_INTERVAL_MS,
  TUNNEL_GRACE_PERIOD_MS,
} from '../constants.js';
import type { FrpTunnelOptions, TunnelInstance, InstanceInfo } from './types.js';
import { validateIdentifier, validatePath, validatePort, sleep } from './utils.js';

/**
 * Default configuration values.
 */
const DEFAULTS = {
  serverHost: 'tunnel.example.com',
  remotePort: DEFAULT_REMOTE_PORT,
  tunnelName: DEFAULT_TUNNEL_NAME,
};

/**
 * Track active tunnel processes.
 */
const activeTunnels = new Map<string, { process?: ChildProcess; pid?: number }>();

/**
 * Cleanup handler registered once.
 */
let cleanupRegistered = false;

/**
 * Register cleanup handler for process exit.
 */
function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  process.on('exit', () => {
    for (const [, tunnel] of activeTunnels) {
      try {
        if (tunnel.process && !tunnel.process.killed) {
          tunnel.process.kill();
        }
        if (tunnel.pid) {
          process.kill(tunnel.pid);
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
  });
}

/**
 * Check if a tunnel is running using pgrep.
 * Safe because tunnelName is validated before use.
 */
function checkTunnelRunning(tunnelName: string): boolean {
  try {
    // pgrep with -f searches the full command line
    // tunnelName is validated to be alphanumeric, so this is safe
    execFileSync('pgrep', ['-f', `frpc.*${tunnelName}`], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill tunnel processes using pkill.
 * Safe because tunnelName is validated before use.
 */
function killTunnelProcesses(tunnelName: string): void {
  try {
    // pkill with -f kills processes matching the pattern
    // tunnelName is validated to be alphanumeric, so this is safe
    execFileSync('pkill', ['-f', `frpc.*${tunnelName}`], { stdio: 'pipe' });
  } catch {
    // No matching processes
  }
}

/**
 * Get PID of running tunnel.
 */
function getTunnelPid(tunnelName: string): number | undefined {
  try {
    const output = execFileSync('pgrep', ['-f', `frpc.*${tunnelName}`], { stdio: 'pipe' });
    return parseInt(output.toString().trim().split('\n')[0], 10);
  } catch {
    return undefined;
  }
}

/**
 * Create a tunnel instance.
 */
function createInstance(
  config: FrpTunnelOptions & typeof DEFAULTS,
  startedAt: Date,
  pid?: number
): TunnelInstance {
  let stopped = false;

  return {
    async stop(): Promise<void> {
      if (stopped) return;

      const active = activeTunnels.get(config.tunnelName);

      if (active?.process) {
        active.process.kill();
      }

      if (active?.pid) {
        try {
          process.kill(active.pid);
        } catch {
          // Process may already be dead
        }
      }

      // Also try to kill any frpc processes for this tunnel
      killTunnelProcesses(config.tunnelName);

      activeTunnels.delete(config.tunnelName);
      stopped = true;
    },

    async isRunning(): Promise<boolean> {
      if (stopped) return false;

      if (checkTunnelRunning(config.tunnelName)) {
        return true;
      }

      const active = activeTunnels.get(config.tunnelName);
      if (active?.process && !active.process.killed) {
        return true;
      }
      return false;
    },

    getInfo(): InstanceInfo {
      return {
        name: config.tunnelName,
        type: 'tunnel',
        port: config.localPort,
        url: `https://${config.serverHost}:${config.remotePort}`,
        pid,
        startedAt,
      };
    },

    async waitForReady(timeoutMs = DEFAULT_TUNNEL_READY_TIMEOUT_MS): Promise<boolean> {
      const start = Date.now();

      while (Date.now() - start < timeoutMs) {
        if (await this.isRunning()) {
          // Give it a moment to establish connection
          await sleep(TUNNEL_GRACE_PERIOD_MS);
          return true;
        }
        await sleep(TUNNEL_CHECK_INTERVAL_MS);
      }

      return false;
    },

    getExternalUrl(): string {
      return `https://${config.serverHost}:${config.remotePort}`;
    },
  };
}

/**
 * Start with an ensure script.
 *
 * Note: The ensureScript must be a trusted path, as it will be executed.
 * This is intended for developer-controlled scripts, not user input.
 */
async function startWithScript(script: string, config: FrpTunnelOptions & typeof DEFAULTS): Promise<number | undefined> {
  // Validate the script path
  validatePath(script, 'ensureScript');

  // Execute the script using execFileSync
  execFileSync(script, [], { stdio: 'pipe' });

  // Try to find the PID
  return getTunnelPid(config.tunnelName);
}

/**
 * Start with a config file.
 */
async function startWithConfig(configPath: string, _tunnelName: string): Promise<{ process: ChildProcess; pid?: number }> {
  // Validate config path
  validatePath(configPath, 'configPath');

  const proc = spawn('frpc', ['-c', configPath], {
    detached: true,
    stdio: 'ignore',
  });

  proc.unref();

  return { process: proc, pid: proc.pid };
}

/**
 * Start with inline configuration.
 */
async function startInline(config: FrpTunnelOptions & typeof DEFAULTS): Promise<{ process: ChildProcess; pid?: number }> {
  const args = [
    'tcp',
    '-s', config.serverHost,
    '-P', DEFAULT_FRP_SERVER_PORT,
    '-n', config.tunnelName,
    '-l', String(config.localPort),
    '-r', String(config.remotePort),
  ];

  const proc = spawn('frpc', args, {
    detached: true,
    stdio: 'ignore',
  });

  proc.unref();

  return { process: proc, pid: proc.pid };
}

/**
 * Start an FRP tunnel.
 */
async function start(options: FrpTunnelOptions): Promise<TunnelInstance> {
  const config = { ...DEFAULTS, ...options };

  // Validate tunnelName to prevent command injection in pgrep/pkill
  validateIdentifier(config.tunnelName, 'tunnelName');

  // Validate ports
  validatePort(config.localPort, 'localPort');
  validatePort(config.remotePort, 'remotePort');

  // Register cleanup handler
  registerCleanup();

  // Check if already running
  if (checkTunnelRunning(config.tunnelName)) {
    // Already running
    return createInstance(config, new Date(), getTunnelPid(config.tunnelName));
  }

  let pid: number | undefined;

  if (config.ensureScript) {
    pid = await startWithScript(config.ensureScript, config);
    activeTunnels.set(config.tunnelName, { pid });
  } else if (config.configPath) {
    const result = await startWithConfig(config.configPath, config.tunnelName);
    activeTunnels.set(config.tunnelName, result);
    pid = result.pid;
  } else {
    const result = await startInline(config);
    activeTunnels.set(config.tunnelName, result);
    pid = result.pid;
  }

  return createInstance(config, new Date(), pid);
}

/**
 * Stop an FRP tunnel.
 */
async function stop(tunnelName = DEFAULTS.tunnelName): Promise<void> {
  // Validate tunnel name
  validateIdentifier(tunnelName, 'tunnelName');

  const active = activeTunnels.get(tunnelName);

  if (active?.process) {
    active.process.kill();
  }

  if (active?.pid) {
    try {
      process.kill(active.pid);
    } catch {
      // Process may already be dead
    }
  }

  // Also try to kill any frpc processes for this tunnel
  killTunnelProcesses(tunnelName);

  activeTunnels.delete(tunnelName);
}

/**
 * Check if an FRP tunnel is running.
 */
async function isRunning(tunnelName = DEFAULTS.tunnelName): Promise<boolean> {
  // Validate tunnel name
  validateIdentifier(tunnelName, 'tunnelName');

  if (checkTunnelRunning(tunnelName)) {
    return true;
  }

  const active = activeTunnels.get(tunnelName);
  if (active?.process && !active.process.killed) {
    return true;
  }
  return false;
}

/**
 * FRP tunnel helper.
 */
export const frpTunnel = {
  start,
  stop,
  isRunning,
};
