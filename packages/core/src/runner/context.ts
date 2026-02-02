/**
 * Execution Context
 *
 * Manages state during scenario execution.
 */

import type { TokenUsage, AgentAdapter, DatabaseAdapter } from '../adapters/types.js';
import type { MatcherContext } from '../assertions/matchers.js';
import type { EntityRow } from '../assertions/types.js';
import type { RelationshipPattern } from '../config/types.js';
import type { AliasRegistry, AliasEntry } from '../scenario/setup.js';
import { normalizeAlias, resolveValue, type AliasContext } from '../utils/alias.js';

import type { CapturedState } from './types.js';

/**
 * Options for creating an execution context.
 */
export interface ExecutionContextOptions {
  /** User ID */
  userId: string;
  /** Agent adapter */
  agent: AgentAdapter;
  /** Database adapter */
  database: DatabaseAdapter;
  /** Initial aliases from setup */
  aliases?: AliasRegistry;
  /** Verbose logging */
  verbose?: boolean;
  /** Relationship patterns for semantic assertions */
  relationshipPatterns?: RelationshipPattern[];
}

/**
 * Execution context for a scenario run.
 *
 * Tracks:
 * - Captured entities from assertions
 * - Aliases from setup steps
 * - Conversation state
 * - Token usage
 */
export class ExecutionContext {
  /** User ID for this run */
  readonly userId: string;

  /** Agent adapter */
  readonly agent: AgentAdapter;

  /** Database adapter */
  readonly database: DatabaseAdapter;

  /** Verbose logging */
  readonly verbose: boolean;

  /** Relationship patterns for semantic assertions */
  readonly relationshipPatterns: RelationshipPattern[];

  /** Captured entities by alias */
  private captured: Map<string, EntityRow> = new Map();

  /** Aliases from setup */
  private aliases: Map<string, AliasEntry> = new Map();

  /** Named conversations by name → conversation ID */
  private conversations: Map<string, string> = new Map();

  /** Current conversation ID */
  private _conversationId?: string;

  /** Most recent correlation ID (for tracing) */
  private _correlationId?: string;

  /** Accumulated token usage */
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  constructor(options: ExecutionContextOptions) {
    this.userId = options.userId;
    this.agent = options.agent;
    this.database = options.database;
    this.verbose = options.verbose ?? false;
    this.relationshipPatterns = options.relationshipPatterns ?? [];

    // Import aliases from setup
    if (options.aliases) {
      for (const [name, entry] of options.aliases.entries()) {
        this.aliases.set(name, entry);
      }
    }
  }

  /**
   * Get current conversation ID.
   */
  get conversationId(): string | undefined {
    return this._conversationId;
  }

  /**
   * Set conversation ID.
   */
  set conversationId(id: string | undefined) {
    this._conversationId = id;
  }

  /**
   * Get most recent correlation ID (for tracing).
   */
  get correlationId(): string | undefined {
    return this._correlationId;
  }

  /**
   * Set correlation ID.
   */
  set correlationId(id: string | undefined) {
    this._correlationId = id;
  }

  // ==========================================================================
  // Named Conversation Management
  // ==========================================================================

  /**
   * Get a named conversation ID.
   *
   * Returns undefined if the conversation name hasn't been used yet,
   * signaling that a new conversation should be created.
   */
  getConversation(name: string): string | undefined {
    const normalized = normalizeAlias(name);
    return this.conversations.get(normalized);
  }

  /**
   * Store a conversation ID under a name.
   *
   * Called after the agent responds to store the conversation ID
   * for future steps that reference the same name.
   */
  setConversation(name: string, id: string): void {
    const normalized = normalizeAlias(name);
    this.conversations.set(normalized, id);
    if (this.verbose) {
      console.log(`  Conversation: ${normalized} = ${id}`);
    }
  }

  /**
   * Check if a named conversation exists.
   */
  hasConversation(name: string): boolean {
    return this.conversations.has(normalizeAlias(name));
  }

  /**
   * Capture an entity under an alias.
   * Normalizes the alias by stripping any $ prefix for consistent storage.
   */
  capture(alias: string, entity: EntityRow): void {
    const normalized = normalizeAlias(alias);
    this.captured.set(normalized, entity);
    if (this.verbose) {
      console.log(`  Captured: ${normalized} = ${entity.id}`);
    }
  }

  /**
   * Get a captured entity by alias.
   * Normalizes the alias for lookup.
   */
  getCaptured(alias: string): EntityRow | undefined {
    return this.captured.get(normalizeAlias(alias));
  }

  /**
   * Get all captured entities.
   */
  getAllCaptured(): Record<string, EntityRow> {
    return Object.fromEntries(this.captured);
  }

  /**
   * Get an alias entry.
   * Normalizes the alias for lookup.
   */
  getAlias(name: string): AliasEntry | undefined {
    return this.aliases.get(normalizeAlias(name));
  }

  /**
   * Check if an alias exists.
   * Normalizes the alias for lookup.
   */
  hasAlias(name: string): boolean {
    return this.aliases.has(normalizeAlias(name));
  }

  /**
   * Set an alias.
   * Normalizes the alias for consistent storage.
   */
  setAlias(name: string, entry: AliasEntry): void {
    this.aliases.set(normalizeAlias(name), entry);
  }

  /**
   * Add token usage from a response.
   */
  addUsage(usage: TokenUsage): void {
    this.usage.inputTokens += usage.inputTokens;
    this.usage.outputTokens += usage.outputTokens;
    this.usage.totalTokens += usage.totalTokens;
  }

  /**
   * Get total token usage.
   */
  getUsage(): TokenUsage {
    return { ...this.usage };
  }

  /**
   * Get matcher context for assertions.
   */
  getMatcherContext(): MatcherContext {
    return {
      captured: Object.fromEntries(this.captured),
      aliases: new Map(this.aliases),
      userId: this.userId,
    };
  }

  /**
   * Get captured state for report.
   */
  getCapturedState(): CapturedState {
    return {
      entities: Object.fromEntries(this.captured),
      conversationId: this._conversationId,
      userId: this.userId,
    };
  }

  /**
   * Resolve a value that may be an alias reference.
   * Uses centralized alias resolution from utils/alias.ts.
   */
  resolve(value: string): string {
    // Build the context for resolution
    const context: AliasContext = {
      captured: Object.fromEntries(this.captured),
      aliases: this.aliases,
      userId: this.userId,
    };

    return resolveValue(value, context);
  }

  /**
   * Clone the context for parallel execution.
   */
  clone(): ExecutionContext {
    const cloned = new ExecutionContext({
      userId: this.userId,
      agent: this.agent,
      database: this.database,
      verbose: this.verbose,
      relationshipPatterns: this.relationshipPatterns,
    });

    // Copy aliases
    for (const [name, entry] of this.aliases) {
      cloned.aliases.set(name, entry);
    }

    return cloned;
  }
}
