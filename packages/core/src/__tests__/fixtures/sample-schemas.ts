/**
 * Sample Zod Schemas for Testing
 *
 * These schemas are used to test the schema-tokens command.
 */

import { z } from 'zod';

/**
 * Simple schema with primitive types.
 */
export const simpleSchema = z.object({
  name: z.string(),
  age: z.number(),
});

/**
 * Schema with descriptions (common for tool definitions).
 */
export const describedSchema = z.object({
  title: z.string().describe('The title of the task'),
  completed: z.boolean().describe('Whether the task is completed'),
});

/**
 * Schema with optional fields and defaults.
 */
export const optionalSchema = z.object({
  required: z.string(),
  optional: z.string().optional(),
  withDefault: z.boolean().default(false),
});

/**
 * Schema with arrays and enums.
 */
export const complexSchema = z.object({
  status: z.enum(['pending', 'active', 'completed']),
  tags: z.array(z.string()),
  metadata: z.record(z.string()),
});

/**
 * Nested schema.
 */
export const nestedSchema = z.object({
  user: z.object({
    id: z.string(),
    profile: z.object({
      firstName: z.string(),
      lastName: z.string(),
    }),
  }),
  settings: z.object({
    theme: z.enum(['light', 'dark']),
  }),
});

/**
 * Schema with union types.
 */
export const unionSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});

/**
 * Not a Zod schema - for testing filtering.
 */
export const notASchema = {
  type: 'object',
  properties: {},
};

/**
 * Plain function - for testing filtering.
 */
export function helperFunction(): string {
  return 'not a schema';
}
