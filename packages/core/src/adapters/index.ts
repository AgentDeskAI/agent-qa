/**
 * Adapters Module
 *
 * Agent, database, and vector store adapters for test execution.
 */

// Types
export type {
  ChatOptions,
  TokenUsage,
  AgentResponse,
  AgentAdapter,
  EntitySchema,
  DatabaseAdapter,
  SetupProcessResult,
  SetupExecutor,
  CombinedAdapter,
  // Vector Store types
  VectorStoreAdapter,
  VectorRecord,
  VectorSearchResult,
  CollectionSchema,
} from './types.js';

// HTTP Agent
export type { HttpAgentOptions } from './agent/http-agent.js';

export { createHttpAgent, createHttpAgentFromConfig } from './agent/http-agent.js';

// Drizzle Database Adapter
export type { DrizzleAdapterOptions } from './database/drizzle-adapter.js';

export { createDrizzleAdapter } from './database/drizzle-adapter.js';

// Null Database Adapter (for testing without database)
export { createNullDatabaseAdapter } from './database/null.js';

// Milvus Vector Store Adapter
export type { MilvusAdapterConfig } from './vector-store/milvus-adapter.js';

export { createMilvusAdapter } from './vector-store/milvus-adapter.js';
