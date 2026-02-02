/**
 * Schema Analyzer Tests
 *
 * Tests for the schema analyzer utility functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Mock the cost-registry module
vi.mock('@agent-qa/cost-registry/counting', () => ({
  createAnthropicCounter: vi.fn(() => {
    return async () => 42;
  }),
}));

import {
  isZodSchema,
  isZodV4,
  zodToJson,
  evaluateSchemaCode,
  formatBytes,
  formatNumber,
  analyzeSchema,
} from '../../../cli/utils/schema-analyzer.js';
import { createAnthropicCounter } from '@agent-qa/cost-registry/counting';

// =============================================================================
// Tests
// =============================================================================

describe('isZodSchema', () => {
  it('should return true for a Zod object schema', () => {
    const schema = z.object({ name: z.string() });
    expect(isZodSchema(schema)).toBe(true);
  });

  it('should return true for a Zod string schema', () => {
    const schema = z.string();
    expect(isZodSchema(schema)).toBe(true);
  });

  it('should return true for a Zod number schema', () => {
    const schema = z.number();
    expect(isZodSchema(schema)).toBe(true);
  });

  it('should return true for a Zod array schema', () => {
    const schema = z.array(z.string());
    expect(isZodSchema(schema)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isZodSchema(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isZodSchema(undefined)).toBe(false);
  });

  it('should return false for a plain object', () => {
    expect(isZodSchema({ type: 'object' })).toBe(false);
  });

  it('should return false for a string', () => {
    expect(isZodSchema('not a schema')).toBe(false);
  });

  it('should return false for a function', () => {
    expect(isZodSchema(() => {})).toBe(false);
  });
});

describe('isZodV4', () => {
  it('should return false for Zod v3 schemas (no toJSONSchema method)', () => {
    const schema = z.object({ name: z.string() });
    // Zod v3 schemas don't have toJSONSchema
    expect(isZodV4(schema)).toBe(false);
  });

  it('should return true for objects with toJSONSchema method', () => {
    const mockV4Schema = {
      _def: {},
      toJSONSchema: () => ({ type: 'object' }),
    };
    expect(isZodV4(mockV4Schema)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isZodV4(null)).toBe(false);
  });
});

describe('zodToJson', () => {
  it('should convert a simple object schema to JSON Schema', () => {
    const schema = z.object({ name: z.string() });
    const jsonSchema = zodToJson(schema);

    expect(jsonSchema).toHaveProperty('type', 'object');
    expect(jsonSchema).toHaveProperty('properties');
    expect((jsonSchema as Record<string, unknown>).properties).toHaveProperty('name');
  });

  it('should convert a schema with descriptions', () => {
    const schema = z.object({
      title: z.string().describe('The title'),
    });
    const jsonSchema = zodToJson(schema) as Record<string, unknown>;

    expect(jsonSchema.type).toBe('object');
    const properties = jsonSchema.properties as Record<string, unknown>;
    const titleProp = properties.title as Record<string, unknown>;
    expect(titleProp.description).toBe('The title');
  });

  it('should convert enum schemas', () => {
    const schema = z.enum(['a', 'b', 'c']);
    const jsonSchema = zodToJson(schema) as Record<string, unknown>;

    expect(jsonSchema.enum).toEqual(['a', 'b', 'c']);
  });

  it('should convert array schemas', () => {
    const schema = z.array(z.string());
    const jsonSchema = zodToJson(schema) as Record<string, unknown>;

    expect(jsonSchema.type).toBe('array');
    expect(jsonSchema.items).toHaveProperty('type', 'string');
  });

  it('should use native toJSONSchema for v4-like objects', () => {
    const mockV4Schema = {
      _def: {},
      toJSONSchema: vi.fn(() => ({ type: 'custom' })),
    };
    const jsonSchema = zodToJson(mockV4Schema);

    expect(mockV4Schema.toJSONSchema).toHaveBeenCalled();
    expect(jsonSchema).toEqual({ type: 'custom' });
  });
});

describe('evaluateSchemaCode', () => {
  it('should evaluate simple object schema code', () => {
    const code = 'z.object({ name: z.string() })';
    const result = evaluateSchemaCode(code);

    expect(isZodSchema(result)).toBe(true);
  });

  it('should evaluate schema with descriptions', () => {
    const code = 'z.object({ title: z.string().describe("The title") })';
    const result = evaluateSchemaCode(code);

    expect(isZodSchema(result)).toBe(true);
    const jsonSchema = zodToJson(result) as Record<string, unknown>;
    const properties = jsonSchema.properties as Record<string, unknown>;
    const titleProp = properties.title as Record<string, unknown>;
    expect(titleProp.description).toBe('The title');
  });

  it('should evaluate enum schemas', () => {
    const code = 'z.enum(["a", "b", "c"])';
    const result = evaluateSchemaCode(code);

    expect(isZodSchema(result)).toBe(true);
  });

  it('should evaluate nested schemas', () => {
    const code = 'z.object({ user: z.object({ name: z.string() }) })';
    const result = evaluateSchemaCode(code);

    expect(isZodSchema(result)).toBe(true);
  });

  it('should evaluate schemas with optional fields', () => {
    const code = 'z.object({ name: z.string().optional() })';
    const result = evaluateSchemaCode(code);

    expect(isZodSchema(result)).toBe(true);
  });

  it('should throw for invalid code', () => {
    expect(() => evaluateSchemaCode('not valid javascript')).toThrow();
  });

  it('should throw for non-schema result', () => {
    expect(() => evaluateSchemaCode('{ type: "object" }')).toThrow(
      'The provided code did not evaluate to a valid Zod schema'
    );
  });
});

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(100)).toBe('100 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });
});

describe('formatNumber', () => {
  it('should format small numbers without separator', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(999)).toBe('999');
  });

  it('should format thousands with separator', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(10000)).toBe('10,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });
});

describe('analyzeSchema', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should analyze a schema and return token count', async () => {
    const schema = z.object({ name: z.string() });
    const result = await analyzeSchema('TestSchema', schema);

    expect(result.name).toBe('TestSchema');
    expect(result.tokenCount).toBe(42);
    expect(result.jsonSchema).toBeDefined();
    expect(result.jsonString).toBeDefined();
    expect(result.jsonSize).toBeGreaterThan(0);
  });

  it('should use provided model', async () => {
    const schema = z.object({ name: z.string() });
    await analyzeSchema('TestSchema', schema, { model: 'claude-sonnet-4-5' });

    expect(createAnthropicCounter).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-5',
      apiKey: 'test-api-key',
    });
  });

  it('should use provided API key', async () => {
    const schema = z.object({ name: z.string() });
    await analyzeSchema('TestSchema', schema, { apiKey: 'custom-key' });

    expect(createAnthropicCounter).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5',
      apiKey: 'custom-key',
    });
  });

  it('should throw when no API key is available', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const schema = z.object({ name: z.string() });
    await expect(analyzeSchema('TestSchema', schema)).rejects.toThrow(
      'ANTHROPIC_API_KEY is required for token counting'
    );
  });
});
