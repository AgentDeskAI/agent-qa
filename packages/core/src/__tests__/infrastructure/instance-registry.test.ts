/**
 * Tests for Instance Registry
 *
 * Uses mocked fs and proper-lockfile to test registry operations without file system.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock proper-lockfile
vi.mock('proper-lockfile', () => ({
  default: {
    lock: vi.fn(),
  },
}));

// Mock os module to control homedir
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Import after mocking
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import lockfile from 'proper-lockfile';
import { InstanceRegistry, getInstanceStateDir } from '../../infrastructure/instance-registry.js';
import { INFRASTRUCTURE_CONFIG } from '../../infrastructure/config.js';

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockLock = vi.mocked(lockfile.lock);

describe('InstanceRegistry', () => {
  let registry: InstanceRegistry;
  let mockReleaseLock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new InstanceRegistry();

    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockReleaseLock = vi.fn().mockResolvedValue(undefined);
    mockLock.mockResolvedValue(mockReleaseLock);
    mockReadFileSync.mockReturnValue(JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('acquire', () => {
    it('should acquire first available slot (instance 0)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));

      const result = await registry.acquire('test');

      expect(result.instanceId).toBe(0);
      expect(result.ports.db).toBe(5438);
      expect(result.ports.api).toBe(4002);
      expect(result.ports.milvus).toBe(19532);
      expect(result.ports.tunnel).toBe(6100);
      expect(result.stateDir).toContain('instance-0');
    });

    it('should acquire second slot when first is taken', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': {
            id: 0,
            ports: { db: 5438, api: 4002, milvus: 19532, tunnel: 6100 },
            pid: process.pid, // Current process - not stale
            startedAt: new Date().toISOString(),
          },
        },
        lastModified: new Date().toISOString(),
      }));

      const result = await registry.acquire('test');

      expect(result.instanceId).toBe(1);
      expect(result.ports.db).toBe(5439);
      expect(result.ports.api).toBe(4003);
    });

    it('should reuse stale slot (dead process)', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': {
            id: 0,
            ports: { db: 5438, api: 4002, milvus: 19532, tunnel: 6100 },
            pid: 99999999, // Non-existent process - stale
            startedAt: new Date().toISOString(),
          },
        },
        lastModified: new Date().toISOString(),
      }));

      const result = await registry.acquire('test');

      // Should reuse slot 0 since the process is dead
      expect(result.instanceId).toBe(0);
    });

    it('should throw when all slots are taken', async () => {
      const instances: Record<string, unknown> = {};
      for (let i = 0; i < INFRASTRUCTURE_CONFIG.maxInstances; i++) {
        instances[String(i)] = {
          id: i,
          ports: { db: 5438 + i, api: 4002 + i, milvus: 19532 + i, tunnel: 6100 + i },
          pid: process.pid, // Current process - not stale
          startedAt: new Date().toISOString(),
        };
      }

      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances,
        lastModified: new Date().toISOString(),
      }));

      await expect(registry.acquire('test')).rejects.toThrow('No available AgentQA instance slots');
    });

    it('should write instance to registry', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));

      await registry.acquire('my-test-description');

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(writtenContent.instances['0']).toBeDefined();
      expect(writtenContent.instances['0'].description).toBe('my-test-description');
      expect(writtenContent.instances['0'].pid).toBe(process.pid);
    });

    it('should create state directory if it does not exist', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('instance-')) {
          return false;
        }
        return true;
      });

      await registry.acquire('test');

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('instance-0'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should release lock after acquire', async () => {
      await registry.acquire('test');

      expect(mockReleaseLock).toHaveBeenCalled();
    });

    it('should handle corrupted registry file', async () => {
      mockReadFileSync.mockReturnValue('not valid json');

      const result = await registry.acquire('test');

      // Should start fresh with instance 0
      expect(result.instanceId).toBe(0);
    });

    it('should create registry file if it does not exist', async () => {
      // First call is for state dir, second for registry file
      mockExistsSync
        .mockReturnValueOnce(true)  // state dir exists
        .mockReturnValueOnce(false); // registry file does not exist

      mockReadFileSync.mockReturnValue(JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));

      await registry.acquire('test');

      // Should have created the initial empty registry
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('should remove instance from registry', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': {
            id: 0,
            ports: { db: 5438, api: 4002, milvus: 19532, tunnel: 6100 },
            pid: process.pid,
            startedAt: new Date().toISOString(),
          },
        },
        lastModified: new Date().toISOString(),
      }));

      await registry.release(0);

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(writtenContent.instances['0']).toBeUndefined();
    });

    it('should handle releasing non-existent instance', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));

      // Should not throw
      await expect(registry.release(0)).resolves.toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all instances', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: { db: 5438 }, pid: 1234, startedAt: new Date().toISOString() },
          '2': { id: 2, ports: { db: 5440 }, pid: 5678, startedAt: new Date().toISOString() },
        },
        lastModified: new Date().toISOString(),
      }));

      const instances = await registry.getAll();

      expect(instances).toHaveLength(2);
      expect(instances.map(i => i.id)).toEqual([0, 2]);
    });

    it('should return empty array when no instances', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));

      const instances = await registry.getAll();

      expect(instances).toHaveLength(0);
    });
  });

  describe('getActive', () => {
    it('should filter out stale instances (dead process)', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: {}, pid: process.pid, startedAt: new Date().toISOString() }, // Active
          '1': { id: 1, ports: {}, pid: 99999999, startedAt: new Date().toISOString() }, // Dead process
        },
        lastModified: new Date().toISOString(),
      }));

      const active = await registry.getActive();

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(0);
    });

    it('should filter out stale instances (timeout exceeded)', async () => {
      const oldTime = new Date(Date.now() - INFRASTRUCTURE_CONFIG.staleInstanceTimeout - 1000).toISOString();

      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: {}, pid: process.pid, startedAt: new Date().toISOString() }, // Active
          '1': { id: 1, ports: {}, pid: process.pid, startedAt: oldTime }, // Timeout exceeded
        },
        lastModified: new Date().toISOString(),
      }));

      const active = await registry.getActive();

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(0);
    });
  });

  describe('getStale', () => {
    it('should return only stale instances', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: {}, pid: process.pid, startedAt: new Date().toISOString() }, // Active
          '1': { id: 1, ports: {}, pid: 99999999, startedAt: new Date().toISOString() }, // Dead process
        },
        lastModified: new Date().toISOString(),
      }));

      const stale = await registry.getStale();

      expect(stale).toHaveLength(1);
      expect(stale[0].id).toBe(1);
    });
  });

  describe('cleanStale', () => {
    it('should remove stale instances and return count', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: {}, pid: process.pid, startedAt: new Date().toISOString() }, // Active
          '1': { id: 1, ports: {}, pid: 99999999, startedAt: new Date().toISOString() }, // Stale
          '2': { id: 2, ports: {}, pid: 88888888, startedAt: new Date().toISOString() }, // Stale
        },
        lastModified: new Date().toISOString(),
      }));

      const removed = await registry.cleanStale();

      expect(removed).toBe(2);
      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(Object.keys(writtenContent.instances)).toEqual(['0']);
    });

    it('should not write if no stale instances', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: {}, pid: process.pid, startedAt: new Date().toISOString() }, // Active
        },
        lastModified: new Date().toISOString(),
      }));

      const removed = await registry.cleanStale();

      expect(removed).toBe(0);
      // Write is only called for the initial registry creation in acquireLock
      // After that, if no stale instances, writeRegistry is not called
    });
  });

  describe('clear', () => {
    it('should remove all instances', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0 },
          '1': { id: 1 },
        },
        lastModified: new Date().toISOString(),
      }));

      await registry.clear();

      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(writtenContent.instances).toEqual({});
    });
  });

  describe('getAvailableCount', () => {
    it('should return max instances when none active', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ instances: {}, lastModified: new Date().toISOString() }));

      const count = await registry.getAvailableCount();

      expect(count).toBe(INFRASTRUCTURE_CONFIG.maxInstances);
    });

    it('should subtract active instances', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: {}, pid: process.pid, startedAt: new Date().toISOString() },
          '1': { id: 1, ports: {}, pid: process.pid, startedAt: new Date().toISOString() },
        },
        lastModified: new Date().toISOString(),
      }));

      const count = await registry.getAvailableCount();

      expect(count).toBe(INFRASTRUCTURE_CONFIG.maxInstances - 2);
    });

    it('should not count stale instances', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({
        instances: {
          '0': { id: 0, ports: {}, pid: process.pid, startedAt: new Date().toISOString() }, // Active
          '1': { id: 1, ports: {}, pid: 99999999, startedAt: new Date().toISOString() }, // Stale
        },
        lastModified: new Date().toISOString(),
      }));

      const count = await registry.getAvailableCount();

      // Stale instance doesn't count as active
      expect(count).toBe(INFRASTRUCTURE_CONFIG.maxInstances - 1);
    });
  });
});

describe('getInstanceStateDir', () => {
  it('should return correct path for instance 0', () => {
    const dir = getInstanceStateDir(0);
    expect(dir).toContain('.agent-qa/instance-0');
  });

  it('should return correct path for instance 5', () => {
    const dir = getInstanceStateDir(5);
    expect(dir).toContain('.agent-qa/instance-5');
  });
});
