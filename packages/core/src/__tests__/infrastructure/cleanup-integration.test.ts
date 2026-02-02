/**
 * Cleanup Integration Tests
 *
 * Deterministic tests that verify resources are always cleaned up after
 * running scenarios. These tests use REAL infrastructure (Docker, tmux)
 * and verify the complete cleanup flow.
 *
 * These tests are conditionally skipped if infrastructure is not available.
 */
import { describe, it, expect, afterAll, beforeAll, afterEach } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  discoverAgentQAContainers,
  discoverAgentQATmuxSessions,
  discoverAgentQAStateFiles,
  discoverAllResources,
  cleanupAllResources,
  cleanupInstance,
  INFRASTRUCTURE_CONFIG,
  getInstanceContainerNames,
  getInstanceTmuxSession,
} from '../../infrastructure/index.js';

// =============================================================================
// Infrastructure Detection
// =============================================================================

function hasDocker(): boolean {
  try {
    execFileSync('docker', ['--version'], { stdio: 'pipe' });
    // Also check if Docker daemon is running
    execFileSync('docker', ['info'], { stdio: 'pipe' });
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
const BOTH_AVAILABLE = DOCKER_AVAILABLE && TMUX_AVAILABLE;

// Test instance IDs - use high numbers to avoid conflicts with real instances
const TEST_INSTANCE_ID = 99;
const TEST_INSTANCE_ID_2 = 98;

// State directory
const STATE_BASE_DIR = join(homedir(), INFRASTRUCTURE_CONFIG.stateDir);

// =============================================================================
// Cleanup Helpers
// =============================================================================

/**
 * Force cleanup all test resources (used in afterAll)
 */
async function forceCleanupTestResources(): Promise<void> {
  const prefix = INFRASTRUCTURE_CONFIG.containerPrefix;

  // Clean up test containers
  for (const instanceId of [TEST_INSTANCE_ID, TEST_INSTANCE_ID_2]) {
    const names = getInstanceContainerNames(instanceId);
    for (const name of Object.values(names)) {
      try {
        execSync(`docker rm -f ${name} 2>/dev/null || true`, { stdio: 'pipe' });
      } catch {
        // Ignore
      }
    }

    // Clean up tmux sessions
    const tmuxSession = getInstanceTmuxSession(instanceId);
    try {
      execSync(`tmux kill-session -t ${tmuxSession} 2>/dev/null || true`, { stdio: 'pipe' });
    } catch {
      // Ignore
    }

    // Clean up state directories
    const stateDir = join(STATE_BASE_DIR, `instance-${instanceId}`);
    try {
      rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

// =============================================================================
// Test Suites
// =============================================================================

describe.skipIf(!BOTH_AVAILABLE)('Cleanup Integration', () => {
  // Clean up any leftover test resources before and after all tests
  beforeAll(async () => {
    await forceCleanupTestResources();
  });

  afterAll(async () => {
    await forceCleanupTestResources();
  });

  // Clean up after each test to ensure isolation
  afterEach(async () => {
    await forceCleanupTestResources();
  });

  describe('cleanupAllResources', () => {
    it('should discover and clean up containers', async () => {
      // 1. Create test containers using AgentQA naming convention
      const containerName = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID}-db`;

      // Start a simple container
      execSync(
        `docker run -d --name ${containerName} alpine:latest sleep 300`,
        { stdio: 'pipe' }
      );

      // 2. Verify container is discovered
      const containersBefore = await discoverAgentQAContainers();
      const foundContainer = containersBefore.find((c) => c.name === containerName);
      expect(foundContainer).toBeDefined();
      expect(foundContainer?.state).toBe('running');

      // 3. Clean up
      const result = await cleanupAllResources({ verbose: false });

      // 4. Verify cleanup result
      expect(result.containersRemoved).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);

      // 5. Verify container is gone
      const containersAfter = await discoverAgentQAContainers();
      const foundAfter = containersAfter.find((c) => c.name === containerName);
      expect(foundAfter).toBeUndefined();
    }, 30000);

    it('should discover and clean up tmux sessions', async () => {
      // 1. Create test tmux session using AgentQA naming convention
      const sessionName = getInstanceTmuxSession(TEST_INSTANCE_ID);

      execSync(
        `tmux new-session -d -s ${sessionName} "sleep 300"`,
        { stdio: 'pipe' }
      );

      // 2. Verify session is discovered
      const sessionsBefore = await discoverAgentQATmuxSessions();
      const foundSession = sessionsBefore.find((s) => s.name === sessionName);
      expect(foundSession).toBeDefined();

      // 3. Clean up
      const result = await cleanupAllResources({ verbose: false });

      // 4. Verify cleanup result
      expect(result.tmuxSessionsKilled).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);

      // 5. Verify session is gone
      const sessionsAfter = await discoverAgentQATmuxSessions();
      const foundAfter = sessionsAfter.find((s) => s.name === sessionName);
      expect(foundAfter).toBeUndefined();
    }, 30000);

    it('should discover and clean up state files', async () => {
      // 1. Create test state directory
      const stateDir = join(STATE_BASE_DIR, `instance-${TEST_INSTANCE_ID}`);
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(join(stateDir, 'test.txt'), 'test content');

      // 2. Verify state files are discovered
      const filesBefore = await discoverAgentQAStateFiles();
      const foundFile = filesBefore.find((f) => f.includes(`instance-${TEST_INSTANCE_ID}`));
      expect(foundFile).toBeDefined();

      // 3. Clean up
      const result = await cleanupAllResources({ verbose: false });

      // 4. Verify cleanup result
      expect(result.stateFilesRemoved).toBeGreaterThanOrEqual(1);

      // 5. Verify state directory is gone
      expect(existsSync(stateDir)).toBe(false);
    }, 30000);

    it('should clean up all resource types together', async () => {
      // 1. Create multiple types of resources
      const containerName = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID}-db`;
      const sessionName = getInstanceTmuxSession(TEST_INSTANCE_ID);
      const stateDir = join(STATE_BASE_DIR, `instance-${TEST_INSTANCE_ID}`);

      // Container
      execSync(
        `docker run -d --name ${containerName} alpine:latest sleep 300`,
        { stdio: 'pipe' }
      );

      // Tmux session
      execSync(
        `tmux new-session -d -s ${sessionName} "sleep 300"`,
        { stdio: 'pipe' }
      );

      // State files
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(join(stateDir, 'compose.yml'), 'version: "3"');

      // 2. Verify all are discovered
      const resourcesBefore = await discoverAllResources();
      expect(resourcesBefore.containers.length).toBeGreaterThanOrEqual(1);
      expect(resourcesBefore.tmuxSessions.length).toBeGreaterThanOrEqual(1);
      expect(resourcesBefore.stateFiles.length).toBeGreaterThanOrEqual(1);

      // 3. Clean up ALL resources
      const result = await cleanupAllResources({ verbose: false });

      // 4. Verify all cleaned up
      expect(result.containersRemoved).toBeGreaterThanOrEqual(1);
      expect(result.tmuxSessionsKilled).toBeGreaterThanOrEqual(1);
      expect(result.stateFilesRemoved).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);

      // 5. Verify nothing remains
      const resourcesAfter = await discoverAllResources();
      const ourContainer = resourcesAfter.containers.find((c) => c.name === containerName);
      const ourSession = resourcesAfter.tmuxSessions.find((s) => s.name === sessionName);
      const ourState = resourcesAfter.stateFiles.find((f) => f.includes(`instance-${TEST_INSTANCE_ID}`));

      expect(ourContainer).toBeUndefined();
      expect(ourSession).toBeUndefined();
      expect(ourState).toBeUndefined();
    }, 60000);
  });

  describe('cleanupInstance', () => {
    it('should clean up only resources for specific instance', async () => {
      // 1. Create resources for TWO different instances
      const container1 = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID}-db`;
      const container2 = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID_2}-db`;
      const session1 = getInstanceTmuxSession(TEST_INSTANCE_ID);
      const session2 = getInstanceTmuxSession(TEST_INSTANCE_ID_2);

      // Instance 99
      execSync(`docker run -d --name ${container1} alpine:latest sleep 300`, { stdio: 'pipe' });
      execSync(`tmux new-session -d -s ${session1} "sleep 300"`, { stdio: 'pipe' });

      // Instance 98
      execSync(`docker run -d --name ${container2} alpine:latest sleep 300`, { stdio: 'pipe' });
      execSync(`tmux new-session -d -s ${session2} "sleep 300"`, { stdio: 'pipe' });

      // 2. Verify both are discovered
      const containersBefore = await discoverAgentQAContainers();
      expect(containersBefore.find((c) => c.name === container1)).toBeDefined();
      expect(containersBefore.find((c) => c.name === container2)).toBeDefined();

      // 3. Clean up ONLY instance 99
      const result = await cleanupInstance(TEST_INSTANCE_ID, { verbose: false });

      // 4. Verify instance 99 is cleaned
      expect(result.containersRemoved).toBeGreaterThanOrEqual(1);
      expect(result.tmuxSessionsKilled).toBeGreaterThanOrEqual(1);

      // 5. Verify instance 99 is gone but instance 98 remains
      const containersAfter = await discoverAgentQAContainers();
      const sessionsAfter = await discoverAgentQATmuxSessions();

      expect(containersAfter.find((c) => c.name === container1)).toBeUndefined();
      expect(sessionsAfter.find((s) => s.name === session1)).toBeUndefined();

      // Instance 98 should still exist
      expect(containersAfter.find((c) => c.name === container2)).toBeDefined();
      expect(sessionsAfter.find((s) => s.name === session2)).toBeDefined();
    }, 60000);
  });

  describe('dry run mode', () => {
    it('should report resources without removing them in dry run mode', async () => {
      // 1. Create test container
      const containerName = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID}-db`;
      execSync(
        `docker run -d --name ${containerName} alpine:latest sleep 300`,
        { stdio: 'pipe' }
      );

      // 2. Run cleanup in dry-run mode
      const result = await cleanupAllResources({ dryRun: true, verbose: false });

      // 3. Verify result shows resources would be cleaned
      expect(result.containersRemoved).toBeGreaterThanOrEqual(1);

      // 4. Verify resources still exist
      const containersAfter = await discoverAgentQAContainers();
      const foundAfter = containersAfter.find((c) => c.name === containerName);
      expect(foundAfter).toBeDefined();
      expect(foundAfter?.state).toBe('running');
    }, 30000);
  });

  describe('orphan recovery', () => {
    it('should clean up orphaned resources from previous crashed runs', async () => {
      // Simulate a "crashed" scenario by creating resources without proper cleanup
      const containerName = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID}-db`;
      const sessionName = getInstanceTmuxSession(TEST_INSTANCE_ID);

      // Create "orphaned" resources
      execSync(`docker run -d --name ${containerName} alpine:latest sleep 300`, { stdio: 'pipe' });
      execSync(`tmux new-session -d -s ${sessionName} "sleep 300"`, { stdio: 'pipe' });

      // Verify they exist (simulating they were left over from a crash)
      const resourcesBefore = await discoverAllResources();
      expect(resourcesBefore.containers.length).toBeGreaterThanOrEqual(1);
      expect(resourcesBefore.tmuxSessions.length).toBeGreaterThanOrEqual(1);

      // "New run" discovers and cleans up orphans
      const result = await cleanupAllResources({ verbose: false });

      expect(result.containersRemoved).toBeGreaterThanOrEqual(1);
      expect(result.tmuxSessionsKilled).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);

      // Verify orphans are gone
      const resourcesAfter = await discoverAllResources();
      const ourContainer = resourcesAfter.containers.find((c) => c.name === containerName);
      const ourSession = resourcesAfter.tmuxSessions.find((s) => s.name === sessionName);
      expect(ourContainer).toBeUndefined();
      expect(ourSession).toBeUndefined();
    }, 60000);
  });

  describe('idempotency', () => {
    it('should be safe to call cleanup multiple times', async () => {
      // 1. Create a resource
      const containerName = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID}-db`;
      execSync(`docker run -d --name ${containerName} alpine:latest sleep 300`, { stdio: 'pipe' });

      // 2. First cleanup
      const result1 = await cleanupAllResources({ verbose: false });
      expect(result1.containersRemoved).toBeGreaterThanOrEqual(1);

      // 3. Second cleanup (should be safe, just find nothing)
      const result2 = await cleanupAllResources({ verbose: false });
      expect(result2.errors).toHaveLength(0);

      // 4. Third cleanup (still safe)
      const result3 = await cleanupAllResources({ verbose: false });
      expect(result3.errors).toHaveLength(0);

      // Verify no AgentQA resources exist
      const resourcesAfter = await discoverAllResources();
      const ourContainer = resourcesAfter.containers.find((c) => c.name === containerName);
      expect(ourContainer).toBeUndefined();
    }, 60000);
  });
});

// =============================================================================
// Docker-only tests
// =============================================================================

describe.skipIf(!DOCKER_AVAILABLE)('Container Cleanup (Docker only)', () => {
  afterEach(async () => {
    await forceCleanupTestResources();
  });

  it('should handle stopped containers', async () => {
    const containerName = `${INFRASTRUCTURE_CONFIG.containerPrefix}-${TEST_INSTANCE_ID}-db`;

    // Create and stop a container
    execSync(`docker run -d --name ${containerName} alpine:latest sleep 1`, { stdio: 'pipe' });
    // Wait for it to exit
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify it's discovered (even if exited)
    const containersBefore = await discoverAgentQAContainers();
    const found = containersBefore.find((c) => c.name === containerName);
    expect(found).toBeDefined();

    // Cleanup should remove it
    const result = await cleanupAllResources({ verbose: false });
    expect(result.containersRemoved).toBeGreaterThanOrEqual(1);

    // Verify it's gone
    const containersAfter = await discoverAgentQAContainers();
    expect(containersAfter.find((c) => c.name === containerName)).toBeUndefined();
  }, 30000);
});

// =============================================================================
// Tmux-only tests
// =============================================================================

describe.skipIf(!TMUX_AVAILABLE)('Tmux Cleanup (Tmux only)', () => {
  afterEach(async () => {
    await forceCleanupTestResources();
  });

  it('should handle multiple tmux sessions', async () => {
    const session1 = getInstanceTmuxSession(TEST_INSTANCE_ID);
    const session2 = getInstanceTmuxSession(TEST_INSTANCE_ID_2);

    // Create multiple sessions
    execSync(`tmux new-session -d -s ${session1} "sleep 300"`, { stdio: 'pipe' });
    execSync(`tmux new-session -d -s ${session2} "sleep 300"`, { stdio: 'pipe' });

    // Verify both discovered
    const sessionsBefore = await discoverAgentQATmuxSessions();
    expect(sessionsBefore.find((s) => s.name === session1)).toBeDefined();
    expect(sessionsBefore.find((s) => s.name === session2)).toBeDefined();

    // Cleanup
    const result = await cleanupAllResources({ verbose: false });
    expect(result.tmuxSessionsKilled).toBeGreaterThanOrEqual(2);

    // Verify both gone
    const sessionsAfter = await discoverAgentQATmuxSessions();
    expect(sessionsAfter.find((s) => s.name === session1)).toBeUndefined();
    expect(sessionsAfter.find((s) => s.name === session2)).toBeUndefined();
  }, 30000);
});
