/**
 * Integration Tests for Infrastructure Helpers
 *
 * These tests use REAL infrastructure (Docker, tmux) and are conditionally
 * skipped if the infrastructure is not available.
 *
 * To run these tests locally, ensure Docker and tmux are installed.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';

import { dockerPostgres } from '../../helpers/docker-postgres.js';
import { dockerCompose } from '../../helpers/docker-compose.js';
import { tmuxProcess } from '../../helpers/tmux-process.js';
import { waitForPort, waitForHealth, checkHealth } from '../../helpers/health.js';

// =============================================================================
// Infrastructure Detection
// =============================================================================

function hasDocker(): boolean {
  try {
    execFileSync('docker', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function hasTmux(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const DOCKER_AVAILABLE = hasDocker();
const TMUX_AVAILABLE = hasTmux();

// Test containers use unique names to avoid conflicts
const TEST_POSTGRES_CONTAINER = 'agent-qa-test-postgres';
const TEST_POSTGRES_PORT = 15432;
const TEST_TMUX_SESSION = 'agent-qa-test-session';

// =============================================================================
// Docker PostgreSQL Integration Tests
// =============================================================================

describe.skipIf(!DOCKER_AVAILABLE)('Docker PostgreSQL Integration', () => {
  afterAll(async () => {
    // Clean up any leftover test containers
    try {
      execFileSync('docker', ['rm', '-f', TEST_POSTGRES_CONTAINER], { stdio: 'pipe' });
    } catch {
      // Container may not exist
    }
  });

  it('should start real PostgreSQL container', async () => {
    const instance = await dockerPostgres.start({
      containerName: TEST_POSTGRES_CONTAINER,
      port: TEST_POSTGRES_PORT,
    });

    try {
      // Verify container is running
      const running = await instance.isRunning();
      expect(running).toBe(true);

      // Verify info is correct
      const info = instance.getInfo();
      expect(info.name).toBe(TEST_POSTGRES_CONTAINER);
      expect(info.port).toBe(TEST_POSTGRES_PORT);
      expect(info.type).toBe('postgres');

      // Verify connection URL format
      const url = instance.getConnectionUrl();
      expect(url).toContain(String(TEST_POSTGRES_PORT));
      expect(url).toContain('postgresql://');

      // Wait for PostgreSQL to be ready (with longer timeout for CI)
      const ready = await instance.waitForReady(60000);
      expect(ready).toBe(true);
    } finally {
      // Clean up
      await instance.remove();
    }
  }, 90000); // 90 second timeout for container operations

  it('should stop and remove PostgreSQL container', async () => {
    const instance = await dockerPostgres.start({
      containerName: TEST_POSTGRES_CONTAINER,
      port: TEST_POSTGRES_PORT,
    });

    // Stop the container
    await instance.stop();
    expect(await instance.isRunning()).toBe(false);

    // Remove should work
    await instance.remove();

    // Verify container no longer exists
    const isRunning = await dockerPostgres.isRunning(TEST_POSTGRES_CONTAINER);
    expect(isRunning).toBe(false);
  }, 60000);

  it('should reuse existing running container', async () => {
    // Start first instance
    const instance1 = await dockerPostgres.start({
      containerName: TEST_POSTGRES_CONTAINER,
      port: TEST_POSTGRES_PORT,
    });

    try {
      // Start second instance with same name - should reuse
      const instance2 = await dockerPostgres.start({
        containerName: TEST_POSTGRES_CONTAINER,
        port: TEST_POSTGRES_PORT,
      });

      // Both should point to same container
      expect(instance2.getInfo().name).toBe(instance1.getInfo().name);

      // Both should be running
      expect(await instance1.isRunning()).toBe(true);
      expect(await instance2.isRunning()).toBe(true);
    } finally {
      await instance1.remove();
    }
  }, 60000);
});

// =============================================================================
// Tmux Integration Tests
// =============================================================================

describe.skipIf(!TMUX_AVAILABLE)('Tmux Integration', () => {
  afterAll(async () => {
    // Clean up any leftover test sessions
    await tmuxProcess.stop(TEST_TMUX_SESSION);
  });

  it('should start and stop real tmux session', async () => {
    const instance = await tmuxProcess.start({
      name: TEST_TMUX_SESSION,
      command: 'echo "test output" && sleep 30',
    });

    try {
      // Verify session is running
      expect(await instance.isRunning()).toBe(true);

      // Verify info
      const info = instance.getInfo();
      expect(info.name).toBe(TEST_TMUX_SESSION);
      expect(info.type).toBe('tmux');

      // Get logs (may need a moment to produce output)
      await new Promise((resolve) => setTimeout(resolve, 500));
      const logs = await instance.getLogs();
      expect(logs).toContain('test');
    } finally {
      await instance.stop();
    }

    // Verify stopped
    expect(await tmuxProcess.isRunning(TEST_TMUX_SESSION)).toBe(false);
  }, 30000);

  it('should reuse existing tmux session', async () => {
    const instance1 = await tmuxProcess.start({
      name: TEST_TMUX_SESSION,
      command: 'sleep 60',
    });

    try {
      // Start second instance - should reuse
      const instance2 = await tmuxProcess.start({
        name: TEST_TMUX_SESSION,
        command: 'sleep 60',
      });

      expect(instance2.sessionName).toBe(instance1.sessionName);
      expect(await instance2.isRunning()).toBe(true);
    } finally {
      await instance1.stop();
    }
  }, 30000);

  it('should capture logs from tmux session', async () => {
    const instance = await tmuxProcess.start({
      name: TEST_TMUX_SESSION,
      command: 'for i in 1 2 3; do echo "line $i"; done && sleep 30',
    });

    try {
      // Wait for output
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const logs = await instance.getLogs(50);
      expect(logs).toContain('line');
    } finally {
      await instance.stop();
    }
  }, 30000);
});

// =============================================================================
// Health Utilities Integration Tests
// =============================================================================

describe.skipIf(!DOCKER_AVAILABLE)('Health Utilities Integration', () => {
  let postgresInstance: Awaited<ReturnType<typeof dockerPostgres.start>>;

  beforeAll(async () => {
    postgresInstance = await dockerPostgres.start({
      containerName: TEST_POSTGRES_CONTAINER,
      port: TEST_POSTGRES_PORT,
    });
    await postgresInstance.waitForReady(60000);
  }, 90000);

  afterAll(async () => {
    if (postgresInstance) {
      await postgresInstance.remove();
    }
  });

  it('should wait for port to be available', async () => {
    // PostgreSQL port should be available
    await expect(waitForPort(TEST_POSTGRES_PORT, { timeout: 5000 }))
      .resolves.toBeUndefined();
  });

  it('should timeout when port is not available', async () => {
    // Port 19999 should not be in use
    await expect(waitForPort(19999, { timeout: 1000 }))
      .rejects.toThrow('Timeout waiting for port');
  });
});

// =============================================================================
// HTTP Health Check Integration Tests
// =============================================================================

describe('HTTP Health Check Integration', () => {
  it('should check real HTTP endpoint', async () => {
    // Use a public endpoint that should always be available
    const isHealthy = await checkHealth('https://httpbin.org/status/200');
    expect(isHealthy).toBe(true);
  }, 10000);

  it('should return false for non-200 status', async () => {
    const isHealthy = await checkHealth('https://httpbin.org/status/500');
    expect(isHealthy).toBe(false);
  }, 10000);

  it('should return false for non-existent endpoint', async () => {
    const isHealthy = await checkHealth('http://localhost:19999/health');
    expect(isHealthy).toBe(false);
  });
});
