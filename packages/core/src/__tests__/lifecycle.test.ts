/**
 * Tests for lifecycle management (globalSetup pattern)
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { runGlobalSetup, runTeardown } from '../lifecycle/index.js';

/**
 * Create a temporary directory for test setup files.
 */
const TEST_DIR = join(tmpdir(), 'agent-qa-lifecycle-tests');

beforeAll(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

/**
 * Write a test setup file.
 */
function writeSetupFile(name: string, content: string): string {
  const filePath = join(TEST_DIR, `${name}.mjs`);
  writeFileSync(filePath, content);
  return filePath;
}

describe('Global Setup', () => {
  describe('runGlobalSetup', () => {
    it('should run setup function and return teardown', async () => {
      const setupPath = writeSetupFile('basic-setup', `
        let setupRan = false;
        let teardownRan = false;

        export async function setup() {
          setupRan = true;
          return async () => {
            teardownRan = true;
          };
        }

        export function getState() {
          return { setupRan, teardownRan };
        }
      `);

      const teardown = await runGlobalSetup(setupPath);

      expect(teardown).toBeDefined();
      expect(typeof teardown).toBe('function');
    });

    it('should accept explicit teardown export', async () => {
      const setupPath = writeSetupFile('explicit-teardown', `
        export async function setup() {
          // Setup without returning teardown
        }

        export async function teardown() {
          // Explicit teardown function
        }
      `);

      const teardown = await runGlobalSetup(setupPath);

      expect(teardown).toBeDefined();
      expect(typeof teardown).toBe('function');
    });

    it('should return undefined when no teardown provided', async () => {
      const setupPath = writeSetupFile('no-teardown', `
        export async function setup() {
          // No teardown
        }
      `);

      const teardown = await runGlobalSetup(setupPath);

      expect(teardown).toBeUndefined();
    });

    it('should throw if file does not exist', async () => {
      await expect(
        runGlobalSetup('/nonexistent/path/setup.ts')
      ).rejects.toThrow('globalSetup file not found');
    });

    it('should throw if setup function is missing', async () => {
      const setupPath = writeSetupFile('no-setup-fn', `
        export function notSetup() {}
      `);

      await expect(
        runGlobalSetup(setupPath)
      ).rejects.toThrow('must export a setup() function');
    });
  });

  describe('runTeardown', () => {
    it('should run teardown function', async () => {
      let teardownRan = false;
      const teardown = async () => {
        teardownRan = true;
      };

      await runTeardown(teardown);

      expect(teardownRan).toBe(true);
    });

    it('should do nothing when teardown is undefined', async () => {
      await expect(runTeardown(undefined)).resolves.toBeUndefined();
    });

    it('should not throw on teardown error', async () => {
      const teardown = async () => {
        throw new Error('Teardown failed');
      };

      // Should not throw, just log error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(runTeardown(teardown)).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Teardown failed:',
        'Teardown failed'
      );

      consoleSpy.mockRestore();
    });

    it('should log when verbose is true', async () => {
      const teardown = async () => {};
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await runTeardown(teardown, { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith('Running teardown...');
      expect(consoleSpy).toHaveBeenCalledWith('Teardown complete');

      consoleSpy.mockRestore();
    });
  });
});

describe('Preflight Checks', () => {
  // These tests would require mocking network calls
  // For now, just verify the module exports correctly
  it('should export quickPreflightCheck', async () => {
    const { quickPreflightCheck } = await import('../lifecycle/index.js');
    expect(typeof quickPreflightCheck).toBe('function');
  });
});
