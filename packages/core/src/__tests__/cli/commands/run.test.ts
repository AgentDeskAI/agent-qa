/**
 * Run Command Tests
 *
 * Tests for the CLI run command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock all dependencies before importing the command
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    ...actual,
    resolve: vi.fn((path: string) => `/resolved/${path}`),
  };
});

vi.mock('../../../adapters/index.js', () => ({
  createHttpAgentFromConfig: vi.fn().mockReturnValue({
    chat: vi.fn().mockResolvedValue({
      text: 'Response',
      toolCalls: [],
      conversationId: 'conv-1',
    }),
  }),
  createDrizzleAdapter: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue([]),
    getEntityConfig: vi.fn().mockReturnValue(null),
  }),
}));

vi.mock('../../../config/index.js', () => ({
  loadConfigWithRaw: vi.fn().mockResolvedValue({
    resolved: {
      name: 'test-config',
      agent: { baseUrl: 'http://localhost:4000' },
      database: {
        url: 'postgres://localhost/test',
        entities: [{ name: 'tasks', table: {} }],
      },
      hooks: {},
    },
    raw: {
      name: 'test-config',
      agent: { baseUrl: 'http://localhost:4000' },
      database: {
        url: 'postgres://localhost/test',
        entities: [{ name: 'tasks', table: {} }],
      },
      hooks: {},
    },
  }),
  getDiagnosticsMaxLines: vi.fn().mockReturnValue(50),
  hasCustomDatabaseAdapter: vi.fn().mockReturnValue(false),
  getCustomDatabaseAdapter: vi.fn(),
}));

vi.mock('../../../lifecycle/global-setup.js', () => ({
  runGlobalSetup: vi.fn().mockResolvedValue(undefined),
  runTeardown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lifecycle/index.js', () => ({
  quickPreflightCheck: vi.fn().mockResolvedValue({
    success: true,
    issues: [],
  }),
}));

vi.mock('../../../reporters/index.js', () => ({
  createConsoleReporter: vi.fn().mockReturnValue({
    onSuiteStart: vi.fn(),
    onScenarioStart: vi.fn(),
    onStepComplete: vi.fn(),
    onScenarioComplete: vi.fn(),
    onSuiteComplete: vi.fn(),
    finalize: vi.fn(),
  }),
}));

vi.mock('../../../runner/index.js', () => ({
  createTestRunner: vi.fn().mockReturnValue({
    runSuite: vi.fn().mockResolvedValue({
      success: true,
      report: {
        scenarios: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 1000,
      },
    }),
  }),
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn().mockReturnValue({}),
}));

vi.mock('postgres', () => ({
  default: vi.fn().mockReturnValue({
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../utils/output.js', () => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  exitWithError: vi.fn().mockImplementation((message: string) => {
    throw new Error(`exitWithError: ${message}`);
  }),
}));

import { registerRunCommand } from '../../../cli/commands/run.js';
import { loadConfigWithRaw } from '../../../config/index.js';
import { quickPreflightCheck } from '../../../lifecycle/index.js';
import { runGlobalSetup, runTeardown } from '../../../lifecycle/global-setup.js';

// =============================================================================
// Tests
// =============================================================================

describe('registerRunCommand', () => {
  let program: Command;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    program.exitOverride(); // Prevent actual process exit

    // Mock process.exit
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('command registration', () => {
    it('should register run command with program', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      expect(runCmd).toBeDefined();
    });

    it('should register --id option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--id')).toBe(true);
    });

    it('should register --tag option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--tag')).toBe(true);
    });

    it('should register --grep option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--grep')).toBe(true);
    });

    it('should register --verbose option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--verbose')).toBe(true);
    });

    it('should register --config option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--config')).toBe(true);
    });

    it('should register --bail option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--bail')).toBe(true);
    });

    it('should register --skip-preflight option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--skip-preflight')).toBe(true);
    });

    it('should register --timeout option', () => {
      registerRunCommand(program);

      const runCmd = program.commands.find((cmd) => cmd.name() === 'run');
      const options = runCmd?.options || [];
      expect(options.some((opt) => opt.long === '--timeout')).toBe(true);
    });
  });

  describe('command execution', () => {
    it('should load config when executed', async () => {
      registerRunCommand(program);

      // Parse will throw due to mocked process.exit
      await expect(
        program.parseAsync(['node', 'test', 'run', 'suite.yaml'])
      ).rejects.toThrow();

      // loadConfigWithRaw should be called - verify it was imported and available
      expect(vi.mocked(loadConfigWithRaw)).toHaveBeenCalled();
    });

    it('should run teardown on preflight failure', async () => {
      const teardownFn = vi.fn();
      vi.mocked(runGlobalSetup).mockResolvedValueOnce(teardownFn);
      vi.mocked(quickPreflightCheck).mockResolvedValueOnce({
        success: false,
        issues: ['Agent not reachable'],
      });

      // Need to mock config with globalSetup
      vi.mocked(loadConfigWithRaw).mockResolvedValueOnce({
        resolved: {
          name: 'test-config',
          globalSetup: './setup.ts',
          agent: { baseUrl: 'http://localhost:4000' },
          database: {
            url: 'postgres://localhost/test',
            entities: [{ name: 'tasks', table: {} }],
          },
          hooks: {},
        },
        raw: {
          name: 'test-config',
          globalSetup: './setup.ts',
          agent: { baseUrl: 'http://localhost:4000' },
          database: {
            url: 'postgres://localhost/test',
            entities: [{ name: 'tasks', table: {} }],
          },
          hooks: {},
        },
      } as never);

      registerRunCommand(program);

      await expect(
        program.parseAsync(['node', 'test', 'run', 'suite.yaml'])
      ).rejects.toThrow();

      expect(vi.mocked(runTeardown)).toHaveBeenCalledWith(teardownFn, expect.anything());
    });
  });
});
