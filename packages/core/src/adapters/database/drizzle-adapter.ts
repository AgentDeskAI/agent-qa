/**
 * Drizzle Database Adapter
 *
 * Database adapter using Drizzle ORM.
 *
 * Note on type safety: Drizzle ORM uses complex generic types that vary significantly
 * between database drivers (pg, mysql, sqlite) and versions. The adapter uses a minimal
 * interface (DrizzleQueryMethods) to describe the methods we need, but internal operations
 * require `any` due to Drizzle's column/table type complexity.
 */

import { eq, and, getTableName, getTableColumns } from 'drizzle-orm';

import type { EntityRow, QueryResult } from '../../assertions/types.js';
import type { EntityConfig, DrizzleTable } from '../../config/types.js';
import type { DatabaseAdapter, EntitySchema } from '../types.js';

/**
 * Drizzle column type (opaque - we don't need to know internals).
 * Used as return type for column helper functions.
 */
type DrizzleColumn = unknown;

// =============================================================================
// Adapter Options and Implementation
// =============================================================================

/**
 * Options for creating a Drizzle database adapter.
 *
 * The `db` parameter accepts any Drizzle database instance. We use a permissive
 * type here because Drizzle's generic types vary significantly between database
 * drivers (postgres, mysql, sqlite) and versions.
 */
export interface DrizzleAdapterOptions {
  /**
   * Drizzle database instance.
   *
   * Accepts any Drizzle DB (postgres, mysql, sqlite) that implements
   * the standard query methods (select, insert, update, delete).
   *
   * We use a permissive type because Drizzle's generic types are complex
   * and vary between drivers. The adapter validates table structures at runtime.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** Entity configurations */
  entities: EntityConfig[];
  /** Default user ID column name */
  defaultUserIdColumn?: string;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Create a Drizzle database adapter.
 */
export function createDrizzleAdapter(options: DrizzleAdapterOptions): DatabaseAdapter {
  const {
    db,
    entities,
    defaultUserIdColumn = 'userId',
    verbose = false,
  } = options;

  // Build entity map for quick lookup
  const entityMap = new Map<string, EntityConfig>();
  for (const entity of entities) {
    entityMap.set(entity.name, entity);
  }

  // Build schemas using Drizzle utility functions
  // Type assertions needed because DrizzleTable is loosely typed to support
  // different Drizzle versions and database drivers
  const schemas: EntitySchema[] = entities.map((config) => {
    if (!config.table) {
      throw new Error(`Entity "${config.name}": table is undefined`);
    }

    const tableName = getTableName(config.table as Parameters<typeof getTableName>[0]);
    const columns = getTableColumns(config.table as Parameters<typeof getTableColumns>[0]);

    return {
      name: config.name,
      tableName,
      titleColumn: config.titleColumn,
      userIdColumn: config.userIdColumn ?? defaultUserIdColumn,
      columns: Object.keys(columns),
    };
  });

  const schemaMap = new Map<string, EntitySchema>();
  for (const schema of schemas) {
    schemaMap.set(schema.name, schema);
  }

  // Type helper for eq() calls - Drizzle's column types are complex generics
  type EqColumn = Parameters<typeof eq>[0];
  type AndCondition = Parameters<typeof and>[0];

  return {
    async findById(entity: string, id: string): Promise<QueryResult> {
      const config = entityMap.get(entity);
      if (!config) {
        throw new Error(`Unknown entity: ${entity}`);
      }

      if (verbose) {
        console.log(`[DB] findById: ${entity} ${id}`);
      }

      const table = config.table;
      const idColumn = getIdColumn(table) as EqColumn;

      const results = (await db
        .select()
        .from(table)
        .where(eq(idColumn, id))
        .limit(1)) as unknown[];

      if (results.length === 0) {
        return { entity: null, found: false };
      }

      return { entity: results[0] as EntityRow, found: true };
    },

    async findByTitle(entity: string, title: string): Promise<QueryResult> {
      const config = entityMap.get(entity);
      if (!config) {
        throw new Error(`Unknown entity: ${entity}`);
      }

      if (!config.titleColumn) {
        throw new Error(`Entity ${entity} has no titleColumn configured`);
      }

      if (verbose) {
        console.log(`[DB] findByTitle: ${entity} "${title}"`);
      }

      const table = config.table;
      const titleColumn = getColumnByName(table, config.titleColumn) as EqColumn;

      const results = (await db
        .select()
        .from(table)
        .where(eq(titleColumn, title))
        .limit(1)) as unknown[];

      if (results.length === 0) {
        return { entity: null, found: false };
      }

      return { entity: results[0] as EntityRow, found: true };
    },

    async list(entity: string, filters?: Record<string, unknown>): Promise<EntityRow[]> {
      const config = entityMap.get(entity);
      if (!config) {
        throw new Error(`Unknown entity: ${entity}`);
      }

      if (verbose) {
        console.log(`[DB] list: ${entity} filters=${JSON.stringify(filters)}`);
      }

      const table = config.table;

      // Build where conditions from filters
      const conditions = buildConditions(table, filters);

      if (conditions.length === 0) {
        const results = (await db.select().from(table)) as unknown[];
        return results as EntityRow[];
      }

      const results = (await db
        .select()
        .from(table)
        .where(and(...(conditions as AndCondition[])))) as unknown[];

      return results as EntityRow[];
    },

    async insert(entity: string, data: Record<string, unknown>): Promise<{ id: string }> {
      const config = entityMap.get(entity);
      if (!config) {
        throw new Error(`Unknown entity: ${entity}`);
      }

      if (verbose) {
        console.log(`[DB] insert: ${entity} data=${JSON.stringify(data)}`);
      }

      // Use custom insert if provided
      if (config.insert) {
        return config.insert(db, data);
      }

      const table = config.table;
      const idColumn = getIdColumn(table);

      const results = (await db
        .insert(table)
        .values(data)
        .returning({ id: idColumn })) as Array<{ id: unknown }>;

      if (results.length === 0) {
        throw new Error(`Insert failed for ${entity}`);
      }

      return { id: String(results[0].id) };
    },

    async update(entity: string, id: string, data: Record<string, unknown>): Promise<void> {
      const config = entityMap.get(entity);
      if (!config) {
        throw new Error(`Unknown entity: ${entity}`);
      }

      if (verbose) {
        console.log(`[DB] update: ${entity} ${id} data=${JSON.stringify(data)}`);
      }

      const table = config.table;
      const idColumn = getIdColumn(table) as EqColumn;

      await db.update(table).set(data).where(eq(idColumn, id));
    },

    async delete(entity: string, id: string): Promise<void> {
      const config = entityMap.get(entity);
      if (!config) {
        throw new Error(`Unknown entity: ${entity}`);
      }

      if (verbose) {
        console.log(`[DB] delete: ${entity} ${id}`);
      }

      const table = config.table;
      const idColumn = getIdColumn(table) as EqColumn;

      await db.delete(table).where(eq(idColumn, id));
    },

    getSchemas(): EntitySchema[] {
      return schemas;
    },

    getSchema(entity: string): EntitySchema | undefined {
      return schemaMap.get(entity);
    },
  };
}

// =============================================================================
// Column Helpers
//
// These functions extract Drizzle column objects from table definitions.
// They must return `DrizzleColumn` (aliased to `unknown`) because Drizzle's
// column types are complex generics that vary by driver and version.
// =============================================================================

/**
 * Get the id column from a Drizzle table.
 *
 * Looks for common id column names ('id', '_id').
 */
function getIdColumn(table: DrizzleTable): DrizzleColumn {
  // Try common id column names
  if ('id' in table && table.id) {
    return table.id;
  }
  if ('_id' in table && table._id) {
    return table._id;
  }

  const tableName = getTableName(table as Parameters<typeof getTableName>[0]);
  throw new Error(`Cannot find id column in table ${tableName}`);
}

/**
 * Get a column by name from a Drizzle table.
 *
 * Throws if the column doesn't exist.
 */
function getColumnByName(table: DrizzleTable, columnName: string): DrizzleColumn {
  if (columnName in table && table[columnName]) {
    return table[columnName];
  }

  const tableName = getTableName(table as Parameters<typeof getTableName>[0]);
  throw new Error(`Cannot find column ${columnName} in table ${tableName}`);
}

/**
 * Get a column by name from a Drizzle table, returning null if not found.
 */
function getColumnNullable(table: DrizzleTable, columnName: string): DrizzleColumn | null {
  if (columnName in table && table[columnName]) {
    return table[columnName];
  }
  return null;
}

/**
 * Build where conditions from filters.
 *
 * Returns an array of eq() conditions for Drizzle's and() function.
 */
function buildConditions(table: DrizzleTable, filters?: Record<string, unknown>): unknown[] {
  if (!filters) {
    return [];
  }

  const conditions: unknown[] = [];

  for (const [key, value] of Object.entries(filters)) {
    const column = getColumnNullable(table, key);
    if (column && value !== undefined) {
      conditions.push(eq(column as Parameters<typeof eq>[0], value));
    }
  }

  return conditions;
}
