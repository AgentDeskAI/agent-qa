/**
 * Chat Command Tests
 *
 * Tests for the CLI chat command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock dependencies
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
      text: 'Agent response',
      toolCalls: [{ name: 'create_task', args: { title: 'Test' } }],
      conversationId: 'conv-123',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
    }),
  }),
}));

vi.mock('../../../config/index.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    name: 'test-config',
    agent: { baseUrl: 'http://localhost:4000' },
    defaultUserId: 'default-user',
  }),
  resolveConfig: vi.fn().mockImplementation((config) =>
    Promise.resolve({
      ...config,
      agent: { baseUrl: 'http://localhost:4000' },
    })
  ),
}));

vi.mock('../../../cli/utils/output.js', () => ({
  info: vi.fn(),
  dim: vi.fn(),
  json: vi.fn(),
  divider: vi.fn(),
  color: vi.fn((color: string, text: string) => text),
  exitWithError: vi.fn().mockImplementation((message: string) => {
    throw new Error(`exitWithError: ${message}`);
  }),
}));

import { registerChatCommand } from '../../../cli/commands/chat.js';
import { loadConfig } from '../../../config/index.js';

// =============================================================================
// Tests
// =============================================================================

describe('registerChatCommand', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    program.exitOverride();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('command registration', () => {
    it('should register chat command with program', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      expect(chatCmd).toBeDefined();
    });

    it('should register --message option', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      const options = chatCmd?.options || [];
      expect(options.some((opt) => opt.long === '--message')).toBe(true);
    });

    it('should register --user option', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      const options = chatCmd?.options || [];
      expect(options.some((opt) => opt.long === '--user')).toBe(true);
    });

    it('should register --thread option', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      const options = chatCmd?.options || [];
      expect(options.some((opt) => opt.long === '--thread')).toBe(true);
    });

    it('should register --verbose option', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      const options = chatCmd?.options || [];
      expect(options.some((opt) => opt.long === '--verbose')).toBe(true);
    });

    it('should register --debug option', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      const options = chatCmd?.options || [];
      expect(options.some((opt) => opt.long === '--debug')).toBe(true);
    });

    it('should register --json option', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      const options = chatCmd?.options || [];
      expect(options.some((opt) => opt.long === '--json')).toBe(true);
    });

    it('should register --config option', () => {
      registerChatCommand(program);

      const chatCmd = program.commands.find((cmd) => cmd.name() === 'chat');
      const options = chatCmd?.options || [];
      expect(options.some((opt) => opt.long === '--config')).toBe(true);
    });
  });

  describe('command execution', () => {
    it('should load config when executed with message', async () => {
      registerChatCommand(program);

      try {
        await program.parseAsync(['node', 'test', 'chat', '-m', 'hello']);
      } catch {
        // Expected to throw due to mocks
      }

      expect(vi.mocked(loadConfig)).toHaveBeenCalled();
    });
  });
});
