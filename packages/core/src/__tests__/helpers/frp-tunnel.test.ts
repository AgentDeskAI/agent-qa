/**
 * Tests for FRP Tunnel Helper
 *
 * Uses mocked child_process to test tunnel operations without requiring FRP client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_TUNNEL_NAME,
  DEFAULT_FRP_SERVER_PORT,
  DEFAULT_REMOTE_PORT,
  DEFAULT_TUNNEL_READY_TIMEOUT_MS,
  TUNNEL_CHECK_INTERVAL_MS,
  TUNNEL_GRACE_PERIOD_MS,
} from '../../constants.js';

// Mock child_process module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

// Mock utils to speed up tests
vi.mock('../../helpers/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../helpers/utils.js')>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

// Import after mocking
import { execFileSync, spawn } from 'node:child_process';
import { frpTunnel } from '../../helpers/frp-tunnel.js';
import { sleep } from '../../helpers/utils.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockSpawn = vi.mocked(spawn);
const mockSleep = vi.mocked(sleep);

// Helper to create mock child process
function createMockProcess(pid = 12345) {
  return {
    pid,
    killed: false,
    kill: vi.fn(),
    unref: vi.fn(),
  };
}

describe('frpTunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('start', () => {
    it('should start with inline config', async () => {
      // Check if running - not running
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'test-tunnel',
        serverHost: 'tunnel.example.com',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'frpc',
        [
          'tcp',
          '-s', 'tunnel.example.com',
          '-P', DEFAULT_FRP_SERVER_PORT,
          '-n', 'test-tunnel',
          '-l', '4000',
          '-r', String(DEFAULT_REMOTE_PORT),
        ],
        expect.objectContaining({ detached: true, stdio: 'ignore' })
      );
      expect(instance.getInfo().name).toBe('test-tunnel');
    });

    it('should start with configPath', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'config-tunnel',
        serverHost: 'tunnel.example.com',
        configPath: '/path/to/frpc.toml',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'frpc',
        ['-c', '/path/to/frpc.toml'],
        expect.anything()
      );
      expect(instance.getInfo().name).toBe('config-tunnel');
    });

    it('should start with ensureScript', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      // ensureScript execution
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      // getTunnelPid
      mockExecFileSync.mockReturnValueOnce(Buffer.from('12345'));

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'script-tunnel',
        serverHost: 'tunnel.example.com',
        ensureScript: '/path/to/ensure-tunnel.sh',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        '/path/to/ensure-tunnel.sh',
        [],
        { stdio: 'pipe' }
      );
      expect(instance.getInfo().name).toBe('script-tunnel');
    });

    it('should reuse existing tunnel', async () => {
      // Check if running - running
      mockExecFileSync.mockReturnValueOnce(Buffer.from('12345'));
      // getTunnelPid
      mockExecFileSync.mockReturnValueOnce(Buffer.from('12345'));

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'existing-tunnel',
        serverHost: 'tunnel.example.com',
      });

      // Should not call spawn
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(instance.getInfo().name).toBe('existing-tunnel');
    });

    it('should validate tunnel name', async () => {
      await expect(frpTunnel.start({
        localPort: 4000,
        tunnelName: 'invalid;name',
        serverHost: 'tunnel.example.com',
      })).rejects.toThrow('must contain only alphanumeric');
    });

    it('should validate localPort', async () => {
      await expect(frpTunnel.start({
        localPort: -1,
        tunnelName: 'test',
        serverHost: 'tunnel.example.com',
      })).rejects.toThrow('must be a valid port number');
    });

    it('should validate remotePort', async () => {
      await expect(frpTunnel.start({
        localPort: 4000,
        remotePort: 70000,
        tunnelName: 'test',
        serverHost: 'tunnel.example.com',
      })).rejects.toThrow('must be a valid port number');
    });

    it('should use default values', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        serverHost: 'tunnel.example.com',
      });

      expect(instance.getInfo().name).toBe(DEFAULT_TUNNEL_NAME);
    });
  });

  describe('stop', () => {
    it('should kill process', async () => {
      // Start a tunnel first
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'stop-test',
        serverHost: 'tunnel.example.com',
      });

      // pkill
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await frpTunnel.stop('stop-test');

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should pkill by name', async () => {
      // No active tunnel in map
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await frpTunnel.stop('pkill-test');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'pkill',
        ['-f', 'frpc.*pkill-test'],
        { stdio: 'pipe' }
      );
    });

    it('should be idempotent', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('no process');
      });

      // Should not throw
      await expect(frpTunnel.stop('nonexistent')).resolves.toBeUndefined();
    });

    it('should validate tunnel name', async () => {
      await expect(frpTunnel.stop('invalid;name')).rejects.toThrow('must contain only alphanumeric');
    });

    it('should use default tunnel name', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await frpTunnel.stop();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'pkill',
        ['-f', `frpc.*${DEFAULT_TUNNEL_NAME}`],
        { stdio: 'pipe' }
      );
    });
  });

  describe('isRunning', () => {
    it('should return true for running tunnel', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('12345'));

      const result = await frpTunnel.isRunning('running-tunnel');

      expect(result).toBe(true);
    });

    it('should return false for not running', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });

      const result = await frpTunnel.isRunning('not-running');

      expect(result).toBe(false);
    });

    it('should validate tunnel name', async () => {
      await expect(frpTunnel.isRunning('invalid;name')).rejects.toThrow('must contain only alphanumeric');
    });

    it('should use default tunnel name', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('12345'));

      await frpTunnel.isRunning();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'pgrep',
        ['-f', `frpc.*${DEFAULT_TUNNEL_NAME}`],
        { stdio: 'pipe' }
      );
    });
  });

  describe('TunnelInstance', () => {
    it('should waitForReady', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'ready-test',
        serverHost: 'tunnel.example.com',
      });

      // isRunning returns true
      mockExecFileSync.mockReturnValue(Buffer.from('12345'));

      const ready = await instance.waitForReady(5000);

      expect(ready).toBe(true);
      expect(mockSleep).toHaveBeenCalled();
    });

    it('should timeout on waitForReady', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      const mockProcess = createMockProcess();
      mockProcess.killed = true;
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'timeout-test',
        serverHost: 'tunnel.example.com',
      });

      // isRunning always returns false
      mockExecFileSync.mockImplementation(() => {
        throw new Error('no process');
      });

      const ready = await instance.waitForReady(100);

      expect(ready).toBe(false);
    });

    it('should return external URL', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'url-test',
        serverHost: 'tunnel.example.com',
        remotePort: 5000,
      });

      const url = instance.getExternalUrl();

      expect(url).toBe('https://tunnel.example.com:5000');
    });

    it('should return correct info', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      const mockProcess = createMockProcess(54321);
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'info-test',
        serverHost: 'tunnel.example.com',
      });

      const info = instance.getInfo();

      expect(info.name).toBe('info-test');
      expect(info.type).toBe('tunnel');
      expect(info.port).toBe(4000);
      expect(info.pid).toBe(54321);
      expect(info.startedAt).toBeInstanceOf(Date);
    });

    it('should stop and mark as not running', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'stop-instance',
        serverHost: 'tunnel.example.com',
      });

      // pkill
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await instance.stop();

      const running = await instance.isRunning();
      expect(running).toBe(false);
    });

    it('should be idempotent on stop', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no process');
      });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const instance = await frpTunnel.start({
        localPort: 4000,
        tunnelName: 'idempotent-test',
        serverHost: 'tunnel.example.com',
      });

      await instance.stop();

      // Second stop should not throw and should not kill again
      await expect(instance.stop()).resolves.toBeUndefined();
    });
  });
});
