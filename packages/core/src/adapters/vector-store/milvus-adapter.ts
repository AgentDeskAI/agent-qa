/**
 * Milvus Vector Store Adapter
 *
 * Implements VectorStoreAdapter using Milvus vector database.
 * Generic adapter that works with any collection and field structure.
 */

import type { MilvusClient } from '@zilliz/milvus2-sdk-node';

import type {
  VectorStoreAdapter,
  VectorRecord,
  VectorSearchResult,
  CollectionSchema,
} from '../types.js';

// =============================================================================
// Configuration
// =============================================================================

export interface MilvusAdapterConfig {
  /** Milvus client instance */
  client: MilvusClient;
  /** Default fields to return when not specified */
  defaultOutputFields?: string[];
  /** Verbose logging */
  verbose?: boolean;
}

// =============================================================================
// Adapter Implementation
// =============================================================================

/**
 * Create a Milvus vector store adapter.
 *
 * Provides generic vector store operations without assumptions about
 * entity types, field names, or filter patterns.
 */
export function createMilvusAdapter(config: MilvusAdapterConfig): VectorStoreAdapter {
  const { client, defaultOutputFields = ['id'], verbose = false } = config;

  return {
    async findById(collection: string, id: string): Promise<VectorRecord | null> {
      if (verbose) {
        console.log(`[milvus-adapter] findById: ${collection} ${id}`);
      }

      try {
        const result = await client.get({
          collection_name: collection,
          ids: [id],
        });

        if (!result.data || result.data.length === 0) {
          return null;
        }

        const row = result.data[0] as Record<string, unknown>;
        const { embedding, ...otherFields } = row;

        return {
          id: String(row.id),
          fields: otherFields,
          embedding: embedding as number[] | undefined,
        };
      } catch (error) {
        if (verbose) {
          console.error(`[milvus-adapter] findById failed:`, error);
        }
        throw error;
      }
    },

    async exists(collection: string, id: string): Promise<boolean> {
      if (verbose) {
        console.log(`[milvus-adapter] exists: ${collection} ${id}`);
      }

      try {
        const result = await client.get({
          collection_name: collection,
          ids: [id],
        });

        return !!(result.data && result.data.length > 0);
      } catch (error) {
        if (verbose) {
          console.error(`[milvus-adapter] exists failed:`, error);
        }
        return false;
      }
    },

    async search(
      collection: string,
      params: {
        embedding: number[];
        filter?: Record<string, unknown>;
        limit?: number;
        outputFields?: string[];
      },
    ): Promise<VectorSearchResult[]> {
      if (verbose) {
        console.log(
          `[milvus-adapter] search: ${collection} filter=${JSON.stringify(params.filter)} limit=${params.limit}`,
        );
      }

      try {
        // Build filter string from object
        const filterClauses = Object.entries(params.filter ?? {}).map(([key, value]) => {
          if (typeof value === 'string') return `${key} == "${value}"`;
          if (typeof value === 'boolean') return `${key} == ${value}`;
          return `${key} == ${value}`;
        });
        const filter = filterClauses.length > 0 ? filterClauses.join(' && ') : undefined;

        const results = await client.search({
          collection_name: collection,
          data: [params.embedding],
          filter,
          limit: params.limit ?? 10,
          output_fields: params.outputFields ?? defaultOutputFields,
        });

        return (results.results ?? []).map((r: { id: string | number; score: number }) => ({
          id: String(r.id),
          similarity: r.score,
          fields: r as unknown as Record<string, unknown>,
        }));
      } catch (error) {
        if (verbose) {
          console.error(`[milvus-adapter] search failed:`, error);
        }
        throw error;
      }
    },

    async listCollections(): Promise<string[]> {
      if (verbose) {
        console.log(`[milvus-adapter] listCollections`);
      }

      try {
        const result = await client.listCollections();
        // ShowCollectionsResponse has data: CollectionData[] with name property
        return (result.data ?? []).map((c) => c.name);
      } catch (error) {
        if (verbose) {
          console.error(`[milvus-adapter] listCollections failed:`, error);
        }
        throw error;
      }
    },

    async getCollectionSchema(collection: string): Promise<CollectionSchema | null> {
      if (verbose) {
        console.log(`[milvus-adapter] getCollectionSchema: ${collection}`);
      }

      try {
        const result = await client.describeCollection({ collection_name: collection });
        if (!result.schema) {
          return null;
        }

        return {
          name: collection,
          fields: result.schema.fields.map((f) => {
            // type_params is KeyValuePair<TypeParamKey, TypeParam>[] - find dim
            const dimParam = f.type_params?.find((p) => p.key === 'dim');
            const dimension = dimParam?.value ? parseInt(String(dimParam.value), 10) : undefined;

            return {
              name: f.name,
              type: String(f.data_type),
              isPrimaryKey: f.is_primary_key,
              dimension,
            };
          }),
        };
      } catch (error) {
        if (verbose) {
          console.error(`[milvus-adapter] getCollectionSchema failed:`, error);
        }
        return null;
      }
    },

    async cleanup(): Promise<void> {
      // Milvus client doesn't require explicit cleanup
      // but we implement the interface for consistency
      if (verbose) {
        console.log(`[milvus-adapter] cleanup`);
      }
    },
  };
}
