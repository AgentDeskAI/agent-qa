/**
 * Tokens Command Tests
 *
 * Tests for the CLI tokens command.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { Command } from 'commander';

// Track mock calls
let mockCounterCalls: string[] = [];

// Mock the cost-registry module - factory runs at hoisting time
vi.mock('@agent-qa/cost-registry/counting', () => ({
  createAnthropicCounter: vi.fn(() => {
    return async (text: string) => {
      mockCounterCalls.push(text);
      return 42;
    };
  }),
}));

// Track output calls
let jsonCalls: unknown[] = [];
let exitWithErrorCalls: string[] = [];

vi.mock('../../../cli/utils/output.js', () => ({
  color: (color: string, text: string) => text,
  json: (data: unknown) => {
    jsonCalls.push(data);
  },
  exitWithError: (message: string) => {
    exitWithErrorCalls.push(message);
  },
}));

import { registerTokensCommand } from '../../../cli/commands/tokens.js';
import { createAnthropicCounter } from '@agent-qa/cost-registry/counting';

// =============================================================================
// Tests
// =============================================================================

describe('registerTokensCommand', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCounterCalls = [];
    jsonCalls = [];
    exitWithErrorCalls = [];
    program = new Command();
    program.exitOverride();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Save original env and set test API key
    originalEnv = { ...process.env };
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original env
    process.env = originalEnv;
  });

  describe('command registration', () => {
    it('should register tokens command with program', () => {
      registerTokensCommand(program);

      const tokensCmd = program.commands.find((cmd) => cmd.name() === 'tokens');
      expect(tokensCmd).toBeDefined();
    });

    it('should register --model option', () => {
      registerTokensCommand(program);

      const tokensCmd = program.commands.find((cmd) => cmd.name() === 'tokens');
      const options = tokensCmd?.options || [];
      expect(options.some((opt) => opt.long === '--model')).toBe(true);
    });

    it('should register --json option', () => {
      registerTokensCommand(program);

      const tokensCmd = program.commands.find((cmd) => cmd.name() === 'tokens');
      const options = tokensCmd?.options || [];
      expect(options.some((opt) => opt.long === '--json')).toBe(true);
    });

    it('should have claude-haiku-4-5 as default model', () => {
      registerTokensCommand(program);

      const tokensCmd = program.commands.find((cmd) => cmd.name() === 'tokens');
      const modelOption = tokensCmd?.options.find((opt) => opt.long === '--model');
      expect(modelOption?.defaultValue).toBe('claude-haiku-4-5');
    });

    it('should accept text as an argument', () => {
      registerTokensCommand(program);

      const tokensCmd = program.commands.find((cmd) => cmd.name() === 'tokens');
      expect(tokensCmd?.description()).toContain('Count tokens');
    });
  });

  describe('command execution', () => {
    it('should count tokens from text argument', async () => {
      registerTokensCommand(program);

      await program.parseAsync(['node', 'test', 'tokens', 'Hello, world!']);

      expect(createAnthropicCounter).toHaveBeenCalledWith({
        model: 'claude-haiku-4-5',
        apiKey: 'test-api-key',
      });
      expect(mockCounterCalls).toContain('Hello, world!');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Token count:'));
    });

    it('should use custom model when specified', async () => {
      registerTokensCommand(program);

      await program.parseAsync([
        'node',
        'test',
        'tokens',
        'Hello',
        '--model',
        'claude-sonnet-4-5',
      ]);

      expect(createAnthropicCounter).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-5',
        apiKey: 'test-api-key',
      });
    });

    it('should output JSON when --json flag is used', async () => {
      registerTokensCommand(program);

      await program.parseAsync(['node', 'test', 'tokens', 'Hello', '--json']);

      expect(jsonCalls).toContainEqual({
        tokens: 42,
        model: 'claude-haiku-4-5',
      });
    });

    it('should error when no text is provided and stdin is TTY', async () => {
      registerTokensCommand(program);

      // Mock stdin as TTY (no piped input)
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      await program.parseAsync(['node', 'test', 'tokens']);

      expect(exitWithErrorCalls.some((msg) => msg.includes('No text provided'))).toBe(true);

      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    });

    it('should error when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      registerTokensCommand(program);

      await program.parseAsync(['node', 'test', 'tokens', 'Hello']);

      expect(
        exitWithErrorCalls.some((msg) =>
          msg.includes('ANTHROPIC_API_KEY environment variable is required')
        )
      ).toBe(true);
    });
  });
});
