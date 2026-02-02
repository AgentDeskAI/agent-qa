/**
 * Schema Analyzer
 *
 * Utilities for analyzing Zod schemas and counting their tokens.
 */

import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as z from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createAnthropicCounter } from '@agent-qa/cost-registry/counting';

/**
 * Result of analyzing a single schema.
 */
export interface SchemaAnalysis {
  name: string;
  jsonSchema: object;
  jsonString: string;
  jsonSize: number;
  tokenCount: number;
}

/**
 * Options for schema analysis.
 */
export interface AnalyzeOptions {
  model?: string;
  apiKey?: string;
}

/**
 * Options for analyzing a module.
 */
export interface AnalyzeModuleOptions extends AnalyzeOptions {
  exportName?: string;
  pattern?: RegExp;
}

/**
 * Check if a value is a Zod schema (works for both v3 and v4).
 */
export function isZodSchema(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_def' in value &&
    typeof (value as Record<string, unknown>)._def === 'object'
  );
}

/**
 * Check if a Zod schema is v4 (has native toJSONSchema method).
 */
export function isZodV4(schema: unknown): boolean {
  return typeof (schema as Record<string, unknown>)?.toJSONSchema === 'function';
}

/**
 * Convert a Zod schema to JSON Schema.
 * Uses native method for Zod v4, zod-to-json-schema for v3.
 */
export function zodToJson(schema: unknown): object {
  if (isZodV4(schema)) {
    // Zod v4 has native toJSONSchema method
    return (schema as { toJSONSchema: () => object }).toJSONSchema();
  }
  // Zod v3 - use zod-to-json-schema library
  return zodToJsonSchema(schema as z.ZodType);
}

/**
 * Analyze a single Zod schema.
 */
export async function analyzeSchema(
  name: string,
  schema: unknown,
  options: AnalyzeOptions = {}
): Promise<SchemaAnalysis> {
  const model = options.model ?? 'claude-haiku-4-5';
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for token counting');
  }

  // Convert to JSON Schema
  const jsonSchema = zodToJson(schema);
  const jsonString = JSON.stringify(jsonSchema, null, 2);
  const jsonSize = Buffer.byteLength(jsonString, 'utf8');

  // Count tokens
  const counter = createAnthropicCounter({ model, apiKey });
  const tokenCount = await counter(jsonString);

  return {
    name,
    jsonSchema,
    jsonString,
    jsonSize,
    tokenCount,
  };
}

/**
 * Evaluate raw Zod schema code from stdin.
 * Provides `z` (zod) in the evaluation context.
 */
export function evaluateSchemaCode(code: string): unknown {
  // Create a function that has access to z
  const evalFn = new Function('z', `return ${code.trim()}`);
  const result = evalFn(z);

  if (!isZodSchema(result)) {
    throw new Error('The provided code did not evaluate to a valid Zod schema');
  }

  return result;
}

/**
 * Analyze a module and extract all Zod schemas.
 */
export async function analyzeModule(
  modulePath: string,
  options: AnalyzeModuleOptions = {}
): Promise<SchemaAnalysis[]> {
  // Resolve the path
  const resolvedPath = isAbsolute(modulePath)
    ? modulePath
    : resolve(process.cwd(), modulePath);

  // Register tsx for TypeScript support
   
  const { register } = await import('tsx/esm/api');
  const unregister = register();

  try {
    // Import the module
    const moduleUrl = pathToFileURL(resolvedPath).href;
    const moduleExports = await import(moduleUrl);

    // Find all Zod schemas in exports
    const schemas: Array<{ name: string; schema: unknown }> = [];

    for (const [name, value] of Object.entries(moduleExports)) {
      // Skip non-schema exports
      if (!isZodSchema(value)) continue;

      // Filter by specific export name
      if (options.exportName && name !== options.exportName) continue;

      // Filter by pattern
      if (options.pattern && !options.pattern.test(name)) continue;

      schemas.push({ name, schema: value });
    }

    if (schemas.length === 0) {
      const filters: string[] = [];
      if (options.exportName) filters.push(`export name "${options.exportName}"`);
      if (options.pattern) filters.push(`pattern "${options.pattern}"`);
      const filterMsg = filters.length > 0 ? ` matching ${filters.join(' and ')}` : '';
      throw new Error(`No Zod schemas found in module${filterMsg}`);
    }

    // Analyze each schema
    const results: SchemaAnalysis[] = [];
    for (const { name, schema } of schemas) {
      const analysis = await analyzeSchema(name, schema, options);
      results.push(analysis);
    }

    return results;
  } finally {
    // Unregister tsx
    unregister();
  }
}

/**
 * Format bytes to human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format number with thousands separator.
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}
