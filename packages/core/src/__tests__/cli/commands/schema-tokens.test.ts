/**
 * Schema Tokens Command Tests
 *
 * Tests for the CLI schema-tokens command.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock the cost-registry module
vi.mock('@agent-qa/cost-registry/counting', () => ({
  createAnthropicCounter: vi.fn(() => {
    return async () => 42;
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

import { registerSchemaTokensCommand } from '../../../cli/commands/schema-tokens.js';

// =============================================================================
// Tests
// =============================================================================

describe('registerSchemaTokensCommand', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    jsonCalls = [];
    exitWithErrorCalls = [];
    program = new Command();
    program.exitOverride();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    originalEnv = { ...process.env };
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('command registration', () => {
    it('should register schema-tokens command with program', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      expect(cmd).toBeDefined();
    });

    it('should register --model option', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const options = cmd?.options || [];
      expect(options.some((opt) => opt.long === '--model')).toBe(true);
    });

    it('should register --export option', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const options = cmd?.options || [];
      expect(options.some((opt) => opt.long === '--export')).toBe(true);
    });

    it('should register --pattern option', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const options = cmd?.options || [];
      expect(options.some((opt) => opt.long === '--pattern')).toBe(true);
    });

    it('should register --name option', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const options = cmd?.options || [];
      expect(options.some((opt) => opt.long === '--name')).toBe(true);
    });

    it('should register --json option', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const options = cmd?.options || [];
      expect(options.some((opt) => opt.long === '--json')).toBe(true);
    });

    it('should register --verbose option', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const options = cmd?.options || [];
      expect(options.some((opt) => opt.long === '--verbose')).toBe(true);
    });

    it('should register --sort option', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const options = cmd?.options || [];
      expect(options.some((opt) => opt.long === '--sort')).toBe(true);
    });

    it('should have claude-haiku-4-5 as default model', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const modelOption = cmd?.options.find((opt) => opt.long === '--model');
      expect(modelOption?.defaultValue).toBe('claude-haiku-4-5');
    });

    it('should have Schema as default name', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const nameOption = cmd?.options.find((opt) => opt.long === '--name');
      expect(nameOption?.defaultValue).toBe('Schema');
    });

    it('should have tokens as default sort', () => {
      registerSchemaTokensCommand(program);

      const cmd = program.commands.find((cmd) => cmd.name() === 'schema-tokens');
      const sortOption = cmd?.options.find((opt) => opt.long === '--sort');
      expect(sortOption?.defaultValue).toBe('tokens');
    });
  });

  describe('file mode execution', () => {
    it('should analyze schemas from a TypeScript file', async () => {
      registerSchemaTokensCommand(program);

      // Use the sample-schemas fixture
      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync(['node', 'test', 'schema-tokens', fixturePath, '--json']);

      expect(jsonCalls.length).toBe(1);
      const result = jsonCalls[0] as Record<string, unknown>;
      expect(result.model).toBe('claude-haiku-4-5');
      expect(result.schemas).toBeDefined();
      expect(Array.isArray(result.schemas)).toBe(true);
      expect(result.total).toBeDefined();
    });

    it('should filter by export name', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--export',
        'simpleSchema',
        '--json',
      ]);

      expect(jsonCalls.length).toBe(1);
      const result = jsonCalls[0] as Record<string, unknown>;
      const schemas = result.schemas as Array<Record<string, unknown>>;
      expect(schemas.length).toBe(1);
      expect(schemas[0].name).toBe('simpleSchema');
    });

    it('should filter by pattern', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--pattern',
        'Schema$',
        '--json',
      ]);

      expect(jsonCalls.length).toBe(1);
      const result = jsonCalls[0] as Record<string, unknown>;
      const schemas = result.schemas as Array<Record<string, unknown>>;
      // All schema exports end with "Schema"
      for (const schema of schemas) {
        expect(schema.name).toMatch(/Schema$/);
      }
    });

    it('should use custom model', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--model',
        'claude-sonnet-4-5',
        '--export',
        'simpleSchema',
        '--json',
      ]);

      expect(jsonCalls.length).toBe(1);
      const result = jsonCalls[0] as Record<string, unknown>;
      expect(result.model).toBe('claude-sonnet-4-5');
    });

    it('should sort by name when specified', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--sort',
        'name',
        '--json',
      ]);

      expect(jsonCalls.length).toBe(1);
      const result = jsonCalls[0] as Record<string, unknown>;
      const schemas = result.schemas as Array<Record<string, unknown>>;
      // Check alphabetical order
      for (let i = 1; i < schemas.length; i++) {
        const prev = schemas[i - 1].name as string;
        const curr = schemas[i].name as string;
        expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
      }
    });

    it('should include JSON schemas when verbose', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--export',
        'simpleSchema',
        '--json',
        '--verbose',
      ]);

      expect(jsonCalls.length).toBe(1);
      const result = jsonCalls[0] as Record<string, unknown>;
      const schemas = result.schemas as Array<Record<string, unknown>>;
      expect(schemas[0].jsonSchema).toBeDefined();
    });

    it('should not include JSON schemas when not verbose', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--export',
        'simpleSchema',
        '--json',
      ]);

      expect(jsonCalls.length).toBe(1);
      const result = jsonCalls[0] as Record<string, unknown>;
      const schemas = result.schemas as Array<Record<string, unknown>>;
      expect(schemas[0].jsonSchema).toBeUndefined();
    });

    it('should output table format by default', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--export',
        'simpleSchema',
      ]);

      // Table output goes to console.log
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(jsonCalls.length).toBe(0);
    });

    it('should error for non-existent file', async () => {
      registerSchemaTokensCommand(program);

      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        'non-existent-file.ts',
        '--json',
      ]);

      expect(exitWithErrorCalls.length).toBe(1);
    });

    it('should error when no schemas match filter', async () => {
      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--export',
        'nonExistentExport',
        '--json',
      ]);

      expect(exitWithErrorCalls.length).toBe(1);
      expect(exitWithErrorCalls[0]).toContain('No Zod schemas found');
    });
  });

  describe('stdin mode execution', () => {
    it('should error when no path and no stdin (TTY mode)', async () => {
      registerSchemaTokensCommand(program);

      // Mock stdin as TTY
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      await program.parseAsync(['node', 'test', 'schema-tokens']);

      expect(exitWithErrorCalls.some((msg) => msg.includes('No input provided'))).toBe(true);

      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    });
  });

  describe('error handling', () => {
    it('should error when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      registerSchemaTokensCommand(program);

      const fixturePath = 'src/__tests__/fixtures/sample-schemas.ts';
      await program.parseAsync([
        'node',
        'test',
        'schema-tokens',
        fixturePath,
        '--export',
        'simpleSchema',
      ]);

      expect(
        exitWithErrorCalls.some((msg) => msg.includes('ANTHROPIC_API_KEY'))
      ).toBe(true);
    });
  });
});
