/**
 * Define Config Helper
 *
 * Provides type-safe configuration for agent-qa.config.ts files.
 */

import type { AgentQAConfig } from './types.js';

/**
 * Define an Agent QA configuration with full type safety.
 *
 * @example
 * ```typescript
 * // agent-qa.config.ts
 * import { defineConfig } from '@agent-qa/core';
 * import * as schema from '@myapp/db/schema';
 *
 * export default defineConfig({
 *   name: 'MyApp',
 *   agent: {
 *     baseUrl: '$API_BASE_URL',
 *     token: '$API_TOKEN',
 *   },
 *   database: {
 *     url: '$DATABASE_URL',
 *     entities: [
 *       { table: schema.tasks, name: 'tasks', titleColumn: 'title' },
 *     ],
 *   },
 * });
 * ```
 */
export function defineConfig(config: AgentQAConfig): AgentQAConfig {
  return config;
}
