/**
 * Tests for Docker Compose Helper
 *
 * Uses mocked child_process to test compose operations without requiring Docker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_COMPOSE_PROJECT_NAME,
  DEFAULT_COMPOSE_STARTUP_TIMEOUT_MS,
  COMPOSE_READINESS_INTERVAL_MS,
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
import { dockerCompose } from '../../helpers/docker-compose.js';
import { sleep } from '../../helpers/utils.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockSleep = vi.mocked(sleep);

describe('dockerCompose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('start', () => {
    it('should start stack with docker compose up', async () => {
      // First call: compose ps returns empty
      mockExecFileSync.mockImplementationOnce(() => Buffer.from(''));
      // Second call: compose up
      mockExecFileSync.mockImplementationOnce(() => Buffer.from(''));

      const instance = await dockerCompose.start({
        projectName: 'my-project',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['compose', '-p', 'my-project', 'ps', '--format', 'json'],
        { stdio: 'pipe', cwd: undefined }
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['compose', '-p', 'my-project', 'up', '-d'],
        { stdio: 'pipe', cwd: undefined }
      );
      expect(instance.getInfo().name).toBe('my-project');
    });

    it('should reuse running stack', async () => {
      // Stack is already running
      mockExecFileSync.mockReturnValueOnce(Buffer.from('{"State":"running","Service":"web"}'));

      const instance = await dockerCompose.start({
        projectName: 'running-project',
      });

      // Should only call compose ps, not compose up
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
      expect(instance.getInfo().name).toBe('running-project');
    });

    it('should handle custom compose path', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await dockerCompose.start({
        projectName: 'custom-path',
        composePath: '/path/to/docker-compose.yml',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['compose', '-f', '/path/to/docker-compose.yml', '-p', 'custom-path', 'ps', '--format', 'json'],
        expect.anything()
      );
    });

    it('should handle custom project name', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({
        projectName: 'custom-project',
      });

      expect(instance.getInfo().name).toBe('custom-project');
    });

    it('should validate project name', async () => {
      await expect(dockerCompose.start({
        projectName: 'invalid;name',
      })).rejects.toThrow('must contain only alphanumeric');
    });

    it('should validate compose path', async () => {
      await expect(dockerCompose.start({
        projectName: 'test',
        composePath: '/path/with;injection',
      })).rejects.toThrow('contains potentially dangerous characters');
    });

    it('should use default project name', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({});

      expect(instance.getInfo().name).toBe(DEFAULT_COMPOSE_PROJECT_NAME);
    });

    it('should start specific services', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(() => Buffer.from(''));

      await dockerCompose.start({
        projectName: 'services-test',
        services: ['web', 'db'],
      });

      // Check that up was called with service names
      const upCall = mockExecFileSync.mock.calls.find(
        call => call[1]?.includes('up')
      );
      expect(upCall?.[1]).toContain('web');
      expect(upCall?.[1]).toContain('db');
    });

    it('should handle cwd option', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await dockerCompose.start({
        projectName: 'cwd-test',
        cwd: '/path/to/project',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        expect.anything(),
        expect.objectContaining({ cwd: '/path/to/project' })
      );
    });
  });

  describe('stop', () => {
    it('should run docker compose down', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await dockerCompose.stop({ projectName: 'stop-test' });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['compose', '-p', 'stop-test', 'down'],
        expect.anything()
      );
    });

    it('should be idempotent', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('no stack');
      });

      // Should not throw
      await expect(dockerCompose.stop({ projectName: 'nonexistent' })).resolves.toBeUndefined();
    });

    it('should validate project name', async () => {
      await expect(dockerCompose.stop({
        projectName: 'invalid;name',
      })).rejects.toThrow('must contain only alphanumeric');
    });
  });

  describe('isRunning', () => {
    it('should parse docker compose ps JSON', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('{"State":"running","Service":"web"}'));

      const result = await dockerCompose.isRunning({ projectName: 'running' });

      expect(result).toBe(true);
    });

    it('should return false when no containers', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const result = await dockerCompose.isRunning({ projectName: 'empty' });

      expect(result).toBe(false);
    });

    it('should return false when containers are not running', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('{"State":"exited","Service":"web"}'));

      const result = await dockerCompose.isRunning({ projectName: 'stopped' });

      expect(result).toBe(false);
    });

    it('should handle malformed JSON gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockExecFileSync.mockReturnValueOnce(Buffer.from('not valid json'));

      const result = await dockerCompose.isRunning({ projectName: 'malformed', verbose: true });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse container JSON'));
      consoleSpy.mockRestore();
    });

    it('should handle multiple container lines', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(
        '{"State":"exited","Service":"db"}\n{"State":"running","Service":"web"}'
      ));

      const result = await dockerCompose.isRunning({ projectName: 'multi' });

      expect(result).toBe(true);
    });

    it('should return false when command fails', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('command failed');
      });

      const result = await dockerCompose.isRunning({ projectName: 'failed' });

      expect(result).toBe(false);
    });

    it('should validate project name', async () => {
      await expect(dockerCompose.isRunning({
        projectName: 'invalid;name',
      })).rejects.toThrow('must contain only alphanumeric');
    });
  });

  describe('ComposeInstance', () => {
    it('should getServices correctly', async () => {
      // Start returns running
      mockExecFileSync.mockReturnValueOnce(Buffer.from('{"State":"running","Service":"web"}'));

      const instance = await dockerCompose.start({ projectName: 'services-test' });

      // getServices call
      mockExecFileSync.mockReturnValueOnce(Buffer.from(
        '{"State":"running","Service":"web"}\n{"State":"running","Service":"db"}'
      ));

      const services = await instance.getServices();

      expect(services).toHaveLength(2);
      expect(services[0]).toEqual({ name: 'web', state: 'running' });
      expect(services[1]).toEqual({ name: 'db', state: 'running' });
    });

    it('should getLogs for specific service', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'logs-test' });

      mockExecFileSync.mockReturnValueOnce(Buffer.from('log line 1\nlog line 2'));

      const logs = await instance.getLogs('web');

      expect(logs).toBe('log line 1\nlog line 2');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['compose', '-p', 'logs-test', 'logs', '--tail', String(DEFAULT_LOG_LINES), 'web'],
        expect.anything()
      );
    });

    it('should getLogs for all services', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'all-logs-test' });

      mockExecFileSync.mockReturnValueOnce(Buffer.from('all logs'));

      const logs = await instance.getLogs();

      expect(logs).toBe('all logs');
    });

    it('should waitForReady', async () => {
      // Start
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'ready-test' });

      // First check: not ready
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      // Second check: ready
      mockExecFileSync.mockReturnValueOnce(Buffer.from('{"State":"running"}'));

      const ready = await instance.waitForReady(5000);

      expect(ready).toBe(true);
    });

    it('should timeout on waitForReady', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'timeout-test' });

      // Always return not running
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const ready = await instance.waitForReady(100);

      expect(ready).toBe(false);
    });

    it('should stop instance', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'stop-instance' });

      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await instance.stop();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['compose', '-p', 'stop-instance', 'down'],
        expect.anything()
      );
    });

    it('should be idempotent on stop', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'idempotent' });

      await instance.stop();
      const callCount = mockExecFileSync.mock.calls.length;

      // Second stop should not call down again
      await instance.stop();
      expect(mockExecFileSync.mock.calls.length).toBe(callCount);
    });

    it('should return correct info', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'info-test' });

      const info = instance.getInfo();

      expect(info.name).toBe('info-test');
      expect(info.type).toBe('compose');
      expect(info.startedAt).toBeInstanceOf(Date);
    });

    it('should mark as not running after stop', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerCompose.start({ projectName: 'running-test' });

      await instance.stop();

      const running = await instance.isRunning();
      expect(running).toBe(false);
    });
  });
});
