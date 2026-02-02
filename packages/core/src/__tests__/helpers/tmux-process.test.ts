/**
 * Tests for Tmux Process Helper
 *
 * Uses mocked child_process to test tmux operations without requiring tmux.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_HEALTH_ENDPOINT,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  DEFAULT_LOG_LINES,
} from '../../constants.js';

// Mock child_process module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
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
import { execFileSync } from 'node:child_process';
import { tmuxProcess } from '../../helpers/tmux-process.js';
import { sleep } from '../../helpers/utils.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockSleep = vi.mocked(sleep);

describe('tmuxProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('start', () => {
    it('should create new session with command', async () => {
      // First call: has-session check (session doesn't exist)
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no session');
      });
      // Second call: new-session
      mockExecFileSync.mockImplementationOnce(() => Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'test-session',
        command: 'echo hello',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['has-session', '-t', 'test-session'],
        { stdio: 'pipe' }
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['new-session', '-d', '-s', 'test-session', 'sh', '-c', 'echo hello'],
        { stdio: 'pipe' }
      );
      expect(instance.sessionName).toBe('test-session');
    });

    it('should reuse existing session', async () => {
      // Session already exists
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'existing-session',
        command: 'echo hello',
      });

      // Should only call has-session, not new-session
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['has-session', '-t', 'existing-session'],
        { stdio: 'pipe' }
      );
      expect(instance.sessionName).toBe('existing-session');
    });

    it('should handle cwd option', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no session');
      });
      mockExecFileSync.mockImplementationOnce(() => Buffer.from(''));

      await tmuxProcess.start({
        name: 'cwd-test',
        command: 'npm start',
        cwd: '/path/to/project',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['new-session', '-d', '-s', 'cwd-test', 'sh', '-c', "cd '/path/to/project' && npm start"],
        { stdio: 'pipe' }
      );
    });

    it('should handle env vars', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no session');
      });
      mockExecFileSync.mockImplementationOnce(() => Buffer.from(''));

      await tmuxProcess.start({
        name: 'env-test',
        command: 'node server.js',
        env: { PORT: '3000', NODE_ENV: 'test' },
      });

      // Env vars should be part of the command (passed to sh -c)
      const lastCall = mockExecFileSync.mock.calls[1];
      const shellCommand = lastCall[1][lastCall[1].length - 1] as string;
      expect(shellCommand).toContain("PORT='3000'");
      expect(shellCommand).toContain("NODE_ENV='test'");
    });

    it('should validate session name', async () => {
      await expect(tmuxProcess.start({
        name: 'invalid;name',
        command: 'echo hello',
      })).rejects.toThrow('must contain only alphanumeric');
    });

    it('should reject invalid session names with spaces', async () => {
      await expect(tmuxProcess.start({
        name: 'name with spaces',
        command: 'echo hello',
      })).rejects.toThrow('must contain only alphanumeric');
    });

    it('should allow valid session names with hyphens and underscores', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'valid-session_name',
        command: 'echo hello',
      });

      expect(instance.sessionName).toBe('valid-session_name');
    });

    it('should apply default config values', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'defaults-test',
        command: 'echo hello',
      });

      const info = instance.getInfo();
      expect(info.type).toBe('tmux');
      expect(info.name).toBe('defaults-test');
    });
  });

  describe('stop', () => {
    it('should kill session', async () => {
      await tmuxProcess.stop('session-to-stop');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'session-to-stop'],
        { stdio: 'pipe' }
      );
    });

    it('should be idempotent (no error if session does not exist)', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no session');
      });

      // Should not throw
      await expect(tmuxProcess.stop('nonexistent')).resolves.toBeUndefined();
    });

    it('should validate session name', async () => {
      await expect(tmuxProcess.stop('invalid;name')).rejects.toThrow('must contain only alphanumeric');
    });
  });

  describe('isRunning', () => {
    it('should return true for existing session', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const result = await tmuxProcess.isRunning('existing');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['has-session', '-t', 'existing'],
        { stdio: 'pipe' }
      );
    });

    it('should return false for missing session', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no session');
      });

      const result = await tmuxProcess.isRunning('missing');

      expect(result).toBe(false);
    });

    it('should validate session name', async () => {
      await expect(tmuxProcess.isRunning('invalid;name')).rejects.toThrow('must contain only alphanumeric');
    });
  });

  describe('getLogs', () => {
    it('should capture pane output', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('line1\nline2\nline3'));

      const logs = await tmuxProcess.getLogs('my-session');

      expect(logs).toBe('line1\nline2\nline3');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['capture-pane', '-t', 'my-session', '-p', '-S', `-${DEFAULT_LOG_LINES}`],
        { stdio: 'pipe' }
      );
    });

    it('should use default line count', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('output'));

      await tmuxProcess.getLogs('session');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['capture-pane', '-t', 'session', '-p', '-S', `-${DEFAULT_LOG_LINES}`],
        { stdio: 'pipe' }
      );
    });

    it('should handle custom line count', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('output'));

      await tmuxProcess.getLogs('session', 50);

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['capture-pane', '-t', 'session', '-p', '-S', '-50'],
        { stdio: 'pipe' }
      );
    });

    it('should return empty string on error', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('failed');
      });

      const logs = await tmuxProcess.getLogs('failed-session');

      expect(logs).toBe('');
    });

    it('should validate session name', async () => {
      await expect(tmuxProcess.getLogs('invalid;name')).rejects.toThrow('must contain only alphanumeric');
    });
  });

  describe('TmuxInstance', () => {
    it('should waitForReady with health URL', async () => {
      // Session exists
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      // Mock fetch for health check
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 })
      );

      const instance = await tmuxProcess.start({
        name: 'health-test',
        command: 'node server.js',
        port: 3000,
      });

      const ready = await instance.waitForReady(1000);

      expect(ready).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(`http://localhost:3000${DEFAULT_HEALTH_ENDPOINT}`);

      mockFetch.mockRestore();
    });

    it('should waitForReady without health URL', async () => {
      // Session exists
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'no-health-test',
        command: 'echo hello',
      });

      const ready = await instance.waitForReady(1000);

      expect(ready).toBe(true);
    });

    it('should timeout on waitForReady', async () => {
      // First: has-session fails (new session needed)
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('no session');
      });
      // Second: new-session succeeds
      mockExecFileSync.mockImplementationOnce(() => Buffer.from(''));

      // Mock fetch to always fail
      const mockFetch = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('connection refused'));

      const instance = await tmuxProcess.start({
        name: 'timeout-test',
        command: 'node server.js',
        port: 3000,
      });

      const ready = await instance.waitForReady(100);

      expect(ready).toBe(false);

      mockFetch.mockRestore();
    });

    it('should sendCommand safely', async () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'command-test',
        command: 'bash',
      });

      instance.sendCommand('echo hello');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['send-keys', '-t', 'command-test', 'echo hello', 'Enter'],
        { stdio: 'pipe' }
      );
    });

    it('should return correct info', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'info-test',
        command: 'node app.js',
        port: 4000,
      });

      const info = instance.getInfo();

      expect(info.name).toBe('info-test');
      expect(info.type).toBe('tmux');
      expect(info.port).toBe(4000);
      expect(info.url).toBe('http://localhost:4000');
      expect(info.startedAt).toBeInstanceOf(Date);
    });

    it('should stop and mark as not running', async () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'stop-test',
        command: 'echo hello',
      });

      await instance.stop();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'stop-test'],
        { stdio: 'pipe' }
      );

      // Should be marked as stopped
      const running = await instance.isRunning();
      expect(running).toBe(false);
    });

    it('should be idempotent on stop', async () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const instance = await tmuxProcess.start({
        name: 'idempotent-test',
        command: 'echo hello',
      });

      await instance.stop();
      const callCount = mockExecFileSync.mock.calls.length;

      // Second stop should not call kill-session again
      await instance.stop();
      expect(mockExecFileSync.mock.calls.length).toBe(callCount);
    });

    it('should getLogs from instance', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('')); // has-session
      mockExecFileSync.mockReturnValueOnce(Buffer.from('log output')); // capture-pane

      const instance = await tmuxProcess.start({
        name: 'logs-test',
        command: 'echo hello',
      });

      const logs = await instance.getLogs();

      expect(logs).toBe('log output');
    });
  });
});
