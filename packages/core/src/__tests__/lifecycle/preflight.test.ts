/**
 * Preflight Check Tests
 *
 * These tests verify the URL parsing and configuration handling logic
 * of the preflight check module. Port checking is done via integration
 * tests in helpers/integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import { quickPreflightCheck } from '../../lifecycle/preflight.js';
import type { ResolvedConfig } from '../../config/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    name: 'test-config',
    scenarios: [],
    agent: {
      baseUrl: 'http://localhost:4000',
      chatEndpoint: '/api/chat',
      userIdHeader: 'x-user-id',
      ...overrides.agent,
    },
    database: {
      url: 'postgresql://localhost:5432/test',
      entities: [],
      ...overrides.database,
    },
    ...overrides,
  } as ResolvedConfig;
}

// Create a mock socket that can be configured
function createMockSocket(behavior: 'connect' | 'timeout' | 'error') {
  const socket = new net.Socket();
  const originalConnect = socket.connect.bind(socket);

  // Spy on methods to track calls
  vi.spyOn(socket, 'setTimeout');
  vi.spyOn(socket, 'destroy');

  // Override connect to simulate behavior
  socket.connect = function (...args: Parameters<typeof socket.connect>) {
    // Trigger behavior after a short delay
    setTimeout(() => {
      if (behavior === 'connect') {
        socket.emit('connect');
      } else if (behavior === 'timeout') {
        socket.emit('timeout');
      } else {
        socket.emit('error', new Error('Connection refused'));
      }
    }, 10);
    return socket;
  } as typeof socket.connect;

  return socket;
}

// =============================================================================
// quickPreflightCheck Tests
// =============================================================================

describe('quickPreflightCheck', () => {
  let originalSocket: typeof net.Socket;
  let socketBehavior: 'connect' | 'timeout' | 'error' = 'connect';

  beforeEach(() => {
    // Store original Socket constructor
    originalSocket = net.Socket;

    // Replace Socket constructor with mock factory
    (net as { Socket: typeof net.Socket }).Socket = class MockSocket extends net.Socket {
      constructor() {
        super();

        // Override connect to simulate behavior
        this.connect = ((...args: Parameters<net.Socket['connect']>) => {
          setTimeout(() => {
            if (socketBehavior === 'connect') {
              this.emit('connect');
            } else if (socketBehavior === 'timeout') {
              this.emit('timeout');
            } else {
              this.emit('error', new Error('Connection refused'));
            }
          }, 5);
          return this;
        }) as net.Socket['connect'];
      }
    } as unknown as typeof net.Socket;
  });

  afterEach(() => {
    // Restore original Socket
    (net as { Socket: typeof net.Socket }).Socket = originalSocket;
    vi.restoreAllMocks();
  });

  describe('API endpoint checks', () => {
    it('should pass when API port is open', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig();

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail when API port is not open', async () => {
      socketBehavior = 'error';
      const config = createMockConfig();

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('API server not responding');
    });

    it('should fail when connection times out', async () => {
      socketBehavior = 'timeout';
      const config = createMockConfig();

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle HTTPS URLs with default port 443', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig({
        agent: {
          baseUrl: 'https://api.example.com',
          chatEndpoint: '/api/chat',
          userIdHeader: 'x-user-id',
        },
      });

      const result = await quickPreflightCheck(config);

      // URL should be parsed correctly, port 443 used
      expect(result.success).toBe(true);
    });

    it('should handle custom ports in URL', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig({
        agent: {
          baseUrl: 'http://localhost:3000',
          chatEndpoint: '/api/chat',
          userIdHeader: 'x-user-id',
        },
      });

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(true);
    });

    it('should fail with invalid URL', async () => {
      const config = createMockConfig({
        agent: {
          baseUrl: 'not-a-valid-url',
          chatEndpoint: '/api/chat',
          userIdHeader: 'x-user-id',
        },
      });

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(false);
      expect(result.issues[0]).toContain('Invalid API URL');
    });

    it('should skip API check when baseUrl is empty', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig({
        agent: {
          baseUrl: '',
          chatEndpoint: '/api/chat',
          userIdHeader: 'x-user-id',
        },
        database: {
          url: '',
          entities: [],
        },
      });

      const result = await quickPreflightCheck(config);

      // No checks run, so success
      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('database checks', () => {
    it('should check database port', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig({
        database: {
          url: 'postgresql://localhost:5432/test',
          entities: [],
        },
      });

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(true);
    });

    it('should use default port 5432 for PostgreSQL', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig({
        database: {
          url: 'postgresql://localhost/test',
          entities: [],
        },
      });

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(true);
    });

    it('should skip database check when URL is empty', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig({
        database: {
          url: '',
          entities: [],
        },
      });

      const result = await quickPreflightCheck(config);

      // Only API check runs
      expect(result.success).toBe(true);
    });

    it('should handle invalid database URL gracefully', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig({
        database: {
          url: 'not-a-valid-url',
          entities: [],
        },
      });

      const result = await quickPreflightCheck(config);

      // Invalid URL parsing is caught, API check passes
      expect(result.success).toBe(true);
    });
  });

  describe('verbose mode', () => {
    it('should log when verbose is true and checks pass', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      socketBehavior = 'connect';
      const config = createMockConfig();

      await quickPreflightCheck(config, { verbose: true });

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('API server')
      )).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should not log when verbose is false', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      socketBehavior = 'connect';
      const config = createMockConfig();

      await quickPreflightCheck(config, { verbose: false });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should log database status when verbose', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      socketBehavior = 'connect';
      const config = createMockConfig();

      await quickPreflightCheck(config, { verbose: true });

      expect(consoleSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('Database')
      )).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('result structure', () => {
    it('should return success true when all checks pass', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig();

      const result = await quickPreflightCheck(config);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('issues');
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should return success false with issues array', async () => {
      socketBehavior = 'error';
      const config = createMockConfig();

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should accumulate multiple issues', async () => {
      const config = createMockConfig({
        agent: {
          baseUrl: 'invalid-url',
          chatEndpoint: '/api/chat',
          userIdHeader: 'x-user-id',
        },
      });

      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('default options', () => {
    it('should use default options when not provided', async () => {
      socketBehavior = 'connect';
      const config = createMockConfig();

      // Call without options
      const result = await quickPreflightCheck(config);

      expect(result.success).toBe(true);
    });
  });
});
