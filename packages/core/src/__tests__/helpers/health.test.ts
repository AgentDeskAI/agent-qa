/**
 * Tests for Health Utilities
 *
 * Uses mocked fetch and net to test health checks without real network connections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEFAULT_HEALTH_TIMEOUT_MS,
  DEFAULT_PORT_CHECK_INTERVAL_MS,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_SOCKET_TIMEOUT_MS,
} from '../../constants.js';

// Mock utils to speed up tests
vi.mock('../../helpers/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../helpers/utils.js')>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

// Create a shared mock socket that tests can configure
const mockSocket = {
  setTimeout: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  connect: vi.fn().mockReturnThis(),
  destroy: vi.fn().mockReturnThis(),
};

// Mock net module with a class-like constructor
vi.mock('node:net', () => {
  const MockSocket = vi.fn(function(this: typeof mockSocket) {
    Object.assign(this, mockSocket);
    return this;
  });

  return {
    default: { Socket: MockSocket },
    Socket: MockSocket,
  };
});

// Import after mocking
import { waitForPort, waitForHealth, checkHealth } from '../../helpers/health.js';
import { sleep } from '../../helpers/utils.js';
import net from 'node:net';

const mockSleep = vi.mocked(sleep);

// Helper to get the mock socket instance
function getMockSocket() {
  return mockSocket;
}

describe('health utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('waitForPort', () => {
    it('should resolve when port opens', async () => {
      const socket = getMockSocket();
      socket.on.mockImplementation((event: string, callback: unknown) => {
        if (event === 'connect') {
          // Simulate immediate connection
          setTimeout(() => (callback as () => void)(), 0);
        }
        return socket;
      });

      await expect(waitForPort(3000)).resolves.toBeUndefined();
    });

    it('should reject on timeout', async () => {
      const socket = getMockSocket();
      socket.on.mockImplementation((event: string, callback: unknown) => {
        if (event === 'error') {
          // Simulate connection error
          setTimeout(() => (callback as (err: Error) => void)(new Error('connection refused')), 0);
        }
        return socket;
      });

      await expect(waitForPort(3000, { timeout: 100 })).rejects.toThrow('Timeout waiting for port');
    });

    it('should handle custom host', async () => {
      const socket = getMockSocket();
      socket.on.mockImplementation((event: string, callback: unknown) => {
        if (event === 'connect') {
          setTimeout(() => (callback as () => void)(), 0);
        }
        return socket;
      });

      await waitForPort(3000, { host: '192.168.1.1' });

      expect(socket.connect).toHaveBeenCalledWith(3000, '192.168.1.1');
    });

    it('should use default options', async () => {
      const socket = getMockSocket();
      socket.on.mockImplementation((event: string, callback: unknown) => {
        if (event === 'connect') {
          setTimeout(() => (callback as () => void)(), 0);
        }
        return socket;
      });

      await waitForPort(3000);

      expect(socket.connect).toHaveBeenCalledWith(3000, 'localhost');
      expect(socket.setTimeout).toHaveBeenCalledWith(DEFAULT_SOCKET_TIMEOUT_MS);
    });

    it('should retry until port opens', async () => {
      let connectionAttempts = 0;
      const socket = getMockSocket();
      socket.on.mockImplementation((event: string, callback: unknown) => {
        if (event === 'error') {
          connectionAttempts++;
          if (connectionAttempts < 3) {
            setTimeout(() => (callback as (err: Error) => void)(new Error('refused')), 0);
          }
        }
        if (event === 'connect' && connectionAttempts >= 2) {
          setTimeout(() => (callback as () => void)(), 0);
        }
        return socket;
      });

      await expect(waitForPort(3000, { timeout: 5000 })).resolves.toBeUndefined();
    });
  });

  describe('waitForHealth', () => {
    it('should resolve when endpoint healthy', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 })
      );

      await expect(waitForHealth('http://localhost:3000/health')).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/health', { method: 'GET', headers: undefined });
      mockFetch.mockRestore();
    });

    it('should reject on timeout', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('connection refused'));

      await expect(waitForHealth('http://localhost:3000/health', { timeout: 100 }))
        .rejects.toThrow('Timeout waiting for health check');

      mockFetch.mockRestore();
    });

    it('should check expectedStatus', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('created', { status: 201 })
      );

      await expect(waitForHealth('http://localhost:3000/health', { expectedStatus: 201 }))
        .resolves.toBeUndefined();

      mockFetch.mockRestore();
    });

    it('should reject if status does not match expectedStatus', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 })
      );

      await expect(waitForHealth('http://localhost:3000/health', { expectedStatus: 201, timeout: 100 }))
        .rejects.toThrow('Timeout waiting for health check');

      mockFetch.mockRestore();
    });

    it('should include custom headers', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 })
      );

      await waitForHealth('http://localhost:3000/health', {
        headers: { Authorization: 'Bearer token123' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({
          headers: { Authorization: 'Bearer token123' },
        })
      );

      mockFetch.mockRestore();
    });

    it('should use HEAD method when specified', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('', { status: 200 })
      );

      await waitForHealth('http://localhost:3000/health', { method: 'HEAD' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({ method: 'HEAD' })
      );

      mockFetch.mockRestore();
    });

    it('should retry until healthy', async () => {
      let callCount = 0;
      const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('connection refused');
        }
        return new Response('ok', { status: 200 });
      });

      await expect(waitForHealth('http://localhost:3000/health', { timeout: 5000 }))
        .resolves.toBeUndefined();

      expect(callCount).toBeGreaterThanOrEqual(3);
      mockFetch.mockRestore();
    });

    it('should accept any 2xx status by default', async () => {
      // Use 202 Accepted instead of 204 No Content (204 requires null body)
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('', { status: 202 })
      );

      await expect(waitForHealth('http://localhost:3000/health')).resolves.toBeUndefined();

      mockFetch.mockRestore();
    });
  });

  describe('checkHealth', () => {
    it('should return true for healthy endpoint', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 })
      );

      const result = await checkHealth('http://localhost:3000/health');

      expect(result).toBe(true);
      mockFetch.mockRestore();
    });

    it('should return false for unhealthy endpoint', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('error', { status: 500 })
      );

      const result = await checkHealth('http://localhost:3000/health');

      expect(result).toBe(false);
      mockFetch.mockRestore();
    });

    it('should return false on fetch error', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

      const result = await checkHealth('http://localhost:3000/health');

      expect(result).toBe(false);
      mockFetch.mockRestore();
    });

    it('should check expectedStatus', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('', { status: 201 })
      );

      const result = await checkHealth('http://localhost:3000/health', { expectedStatus: 201 });

      expect(result).toBe(true);
      mockFetch.mockRestore();
    });

    it('should return false if status does not match expectedStatus', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 })
      );

      const result = await checkHealth('http://localhost:3000/health', { expectedStatus: 201 });

      expect(result).toBe(false);
      mockFetch.mockRestore();
    });

    it('should use HEAD method when specified', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('', { status: 200 })
      );

      await checkHealth('http://localhost:3000/health', { method: 'HEAD' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({ method: 'HEAD' })
      );

      mockFetch.mockRestore();
    });

    it('should include custom headers', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 })
      );

      await checkHealth('http://localhost:3000/health', {
        headers: { 'X-Custom-Header': 'value' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({
          headers: { 'X-Custom-Header': 'value' },
        })
      );

      mockFetch.mockRestore();
    });
  });
});
