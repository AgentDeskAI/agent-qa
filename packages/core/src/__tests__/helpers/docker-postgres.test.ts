/**
 * Tests for Docker PostgreSQL Helper
 *
 * Uses mocked child_process to test postgres operations without requiring Docker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_POSTGRES_PORT,
  DEFAULT_POSTGRES_IMAGE,
  DEFAULT_CONTAINER_NAME,
  DEFAULT_DATABASE_NAME,
  DEFAULT_POSTGRES_USER,
  CONTAINER_ID_LENGTH,
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
import { dockerPostgres } from '../../helpers/docker-postgres.js';
import { sleep } from '../../helpers/utils.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockSleep = vi.mocked(sleep);

describe('dockerPostgres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('start', () => {
    it('should create new container', async () => {
      // Check if running - not running
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      // Check if exists - doesn't exist
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      // Run container
      mockExecFileSync.mockReturnValueOnce(Buffer.from('abc123container456'));

      const instance = await dockerPostgres.start({
        containerName: 'test-postgres',
        port: 5433,
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['run', '-d', '--name', 'test-postgres']),
        { stdio: 'pipe' }
      );
      expect(instance.getInfo().name).toBe('test-postgres');
      expect(instance.getInfo().port).toBe(5433);
    });

    it('should start stopped container', async () => {
      // Check if running - not running
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not running');
      });
      // Check if exists - exists
      mockExecFileSync.mockReturnValueOnce(Buffer.from('abc123container'));
      // Start container
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const instance = await dockerPostgres.start({
        containerName: 'stopped-postgres',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['start', 'stopped-postgres'],
        { stdio: 'pipe' }
      );
      expect(instance.getInfo().name).toBe('stopped-postgres');
    });

    it('should reuse running container', async () => {
      // Check if running - running
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      // Get container ID
      mockExecFileSync.mockReturnValueOnce(Buffer.from('abc123container'));

      const instance = await dockerPostgres.start({
        containerName: 'running-postgres',
      });

      // Should only check running status and get ID, not start or run
      expect(mockExecFileSync).toHaveBeenCalledTimes(2);
      expect(instance.getInfo().name).toBe('running-postgres');
    });

    it('should validate container name', async () => {
      await expect(dockerPostgres.start({
        containerName: 'invalid;name',
      })).rejects.toThrow('must contain only alphanumeric');
    });

    it('should validate port', async () => {
      await expect(dockerPostgres.start({
        containerName: 'test',
        port: -1,
      })).rejects.toThrow('must be a valid port number');
    });

    it('should validate port upper bound', async () => {
      await expect(dockerPostgres.start({
        containerName: 'test',
        port: 70000,
      })).rejects.toThrow('must be a valid port number');
    });

    it('should validate dataPath', async () => {
      await expect(dockerPostgres.start({
        containerName: 'test',
        dataPath: '/path/with;injection',
      })).rejects.toThrow('contains potentially dangerous characters');
    });

    it('should set environment variables', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      await dockerPostgres.start({
        containerName: 'env-test',
        username: 'customuser',
        password: 'custompass',
        databaseName: 'customdb',
      });

      const runCall = mockExecFileSync.mock.calls.find(
        call => call[1]?.includes('run')
      );
      expect(runCall?.[1]).toContain('-e');
      expect(runCall?.[1]).toContain('POSTGRES_USER=customuser');
      expect(runCall?.[1]).toContain('POSTGRES_PASSWORD=custompass');
      expect(runCall?.[1]).toContain('POSTGRES_DB=customdb');
    });

    it('should use default values', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({});

      expect(instance.getInfo().name).toBe(DEFAULT_CONTAINER_NAME);
      expect(instance.getInfo().port).toBe(DEFAULT_POSTGRES_PORT);
    });

    it('should handle dataPath volume mount', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      await dockerPostgres.start({
        containerName: 'volume-test',
        dataPath: '/data/postgres',
      });

      const runCall = mockExecFileSync.mock.calls.find(
        call => call[1]?.includes('run')
      );
      expect(runCall?.[1]).toContain('-v');
      expect(runCall?.[1]).toContain('/data/postgres:/var/lib/postgresql/data');
    });

    it('should use specified image', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      await dockerPostgres.start({
        containerName: 'image-test',
        image: 'postgres:14',
      });

      const runCall = mockExecFileSync.mock.calls.find(
        call => call[1]?.includes('run')
      );
      expect(runCall?.[1]).toContain('postgres:14');
    });
  });

  describe('stop', () => {
    it('should stop container', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await dockerPostgres.stop('my-postgres');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['stop', 'my-postgres'],
        { stdio: 'pipe' }
      );
    });

    it('should handle already stopped', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('already stopped');
      });

      // Should not throw
      await expect(dockerPostgres.stop('stopped')).resolves.toBeUndefined();
    });

    it('should validate container name', async () => {
      await expect(dockerPostgres.stop('invalid;name')).rejects.toThrow('must contain only alphanumeric');
    });

    it('should use default container name', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await dockerPostgres.stop();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['stop', DEFAULT_CONTAINER_NAME],
        { stdio: 'pipe' }
      );
    });
  });

  describe('isRunning', () => {
    it('should return true for running container', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));

      const result = await dockerPostgres.isRunning('running-pg');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['inspect', '-f', '{{.State.Running}}', 'running-pg'],
        { stdio: 'pipe' }
      );
    });

    it('should return false for stopped container', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('false'));

      const result = await dockerPostgres.isRunning('stopped-pg');

      expect(result).toBe(false);
    });

    it('should return false for non-existent container', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });

      const result = await dockerPostgres.isRunning('nonexistent');

      expect(result).toBe(false);
    });

    it('should validate container name', async () => {
      await expect(dockerPostgres.isRunning('invalid;name')).rejects.toThrow('must contain only alphanumeric');
    });

    it('should use default container name', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));

      await dockerPostgres.isRunning();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['inspect', '-f', '{{.State.Running}}', DEFAULT_CONTAINER_NAME],
        { stdio: 'pipe' }
      );
    });
  });

  describe('PostgresInstance', () => {
    it('should waitForReady with pg_isready', async () => {
      // Start setup
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({
        containerName: 'ready-test',
        username: 'testuser',
        databaseName: 'testdb',
      });

      // pg_isready succeeds
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      const ready = await instance.waitForReady();

      expect(ready).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['exec', 'ready-test', 'pg_isready', '-U', 'testuser', '-d', 'testdb'],
        { stdio: 'pipe' }
      );
    });

    it('should timeout on waitForReady', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({
        containerName: 'timeout-test',
      });

      // pg_isready always fails
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not ready');
      });

      const ready = await instance.waitForReady(100);

      expect(ready).toBe(false);
    });

    it('should return correct connection URL', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({
        containerName: 'url-test',
        port: 5433,
        username: 'myuser',
        password: 'mypass',
        databaseName: 'mydb',
      });

      const url = instance.getConnectionUrl();

      expect(url).toBe('postgresql://myuser:mypass@localhost:5433/mydb');
    });

    it('should remove container', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({
        containerName: 'remove-test',
      });

      // stop and rm
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));
      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await instance.remove();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['stop', 'remove-test'],
        { stdio: 'pipe' }
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['rm', 'remove-test'],
        { stdio: 'pipe' }
      );
    });

    it('should stop instance', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({
        containerName: 'stop-test',
      });

      mockExecFileSync.mockReturnValueOnce(Buffer.from(''));

      await instance.stop();

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'docker',
        ['stop', 'stop-test'],
        { stdio: 'pipe' }
      );
    });

    it('should be idempotent on stop', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({
        containerName: 'idempotent-test',
      });

      await instance.stop();
      const callCount = mockExecFileSync.mock.calls.length;

      // Second stop should not call docker stop again
      await instance.stop();
      expect(mockExecFileSync.mock.calls.length).toBe(callCount);
    });

    it('should mark as not running after stop', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('containerid'));

      const instance = await dockerPostgres.start({
        containerName: 'running-check',
      });

      await instance.stop();

      const running = await instance.isRunning();
      expect(running).toBe(false);
    });

    it('should return correct info', async () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('true'));
      mockExecFileSync.mockReturnValueOnce(Buffer.from('abc123def456'));

      const instance = await dockerPostgres.start({
        containerName: 'info-test',
        port: 5433,
      });

      const info = instance.getInfo();

      expect(info.name).toBe('info-test');
      expect(info.type).toBe('postgres');
      expect(info.port).toBe(5433);
      expect(info.url).toContain('5433');
      expect(info.containerId).toBe('abc123def456'.slice(0, CONTAINER_ID_LENGTH));
      expect(info.startedAt).toBeInstanceOf(Date);
    });
  });
});
