/**
 * Null Database Adapter
 *
 * A no-op database adapter for scenarios without database assertions.
 * Returns empty results and throws descriptive errors if entity operations are attempted.
 */

import type { DatabaseAdapter, EntitySchema } from '../types.js';
import type { EntityRow, QueryResult } from '../../assertions/types.js';

/**
 * Create a null database adapter for database-less testing.
 *
 * This adapter is used when no database is configured. It throws descriptive
 * errors if entity assertions are attempted, guiding users to configure a database
 * or remove entity assertions from their scenarios.
 */
export function createNullDatabaseAdapter(): DatabaseAdapter {
  const throwNoDatabaseError = (operation: string): never => {
    throw new Error(
      `Database operation "${operation}" attempted but no database is configured. ` +
        `Either configure a database in agentqa.config.ts or remove entity assertions from your scenarios.`,
    );
  };

  return {
    findById(_entity: string, _id: string): Promise<QueryResult> {
      return throwNoDatabaseError('findById');
    },

    findByTitle(_entity: string, _title: string): Promise<QueryResult> {
      return throwNoDatabaseError('findByTitle');
    },

    list(_entity: string, _filters?: Record<string, unknown>): Promise<EntityRow[]> {
      // Return empty list - this is safe for count assertions
      return Promise.resolve([]);
    },

    insert(_entity: string, _data: Record<string, unknown>): Promise<{ id: string }> {
      return throwNoDatabaseError('insert');
    },

    update(_entity: string, _id: string, _data: Record<string, unknown>): Promise<void> {
      return throwNoDatabaseError('update');
    },

    delete(_entity: string, _id: string): Promise<void> {
      return throwNoDatabaseError('delete');
    },

    getSchemas(): EntitySchema[] {
      return [];
    },

    getSchema(_entity: string): EntitySchema | undefined {
      return undefined;
    },

    cleanup(): Promise<void> {
      return Promise.resolve();
    },
  };
}
