/**
 * User Isolation
 *
 * Generates and manages unique user IDs for per-scenario isolation.
 * This allows multiple scenarios to run in parallel without data conflicts.
 */

import { randomUUID, createHash } from 'node:crypto';

/**
 * Prefix for AgentQA test users.
 * Makes it easy to identify and clean up test users.
 */
export const AGENTQA_USER_PREFIX = 'agentqa';

/**
 * Pattern for legacy format (non-UUID).
 * Format: agentqa-<scenario-slug>-<uuid-prefix>
 * Example: agentqa-test001-a1b2c3d4
 */
export const AGENTQA_USER_PATTERN = /^agentqa-[a-z0-9]+-[a-f0-9]{8}$/;

/**
 * UUID namespace for AgentQA user IDs.
 * This is a fixed UUID used to generate deterministic UUIDs from scenario IDs.
 */
const AGENTQA_UUID_NAMESPACE = 'a9e7f8d0-1234-5678-9abc-def012345678';

/**
 * Options for generating a scenario user ID.
 */
export interface GenerateUserIdOptions {
  /** Scenario ID to include in the user ID */
  scenarioId: string;
  /** Optional seed for reproducibility */
  seed?: string;
}

/**
 * Sanitize a scenario ID for use in a user ID.
 * Removes special characters and converts to lowercase.
 */
function sanitizeScenarioId(scenarioId: string): string {
  return scenarioId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20); // Limit length
}

/**
 * Generate a deterministic UUID from a string using SHA-256.
 * This creates a UUID v4-like format that is reproducible.
 */
function generateDeterministicUuid(input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // Where 4 indicates version 4 and y is 8, 9, a, or b
  const uuid = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // Version 4
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // Variant
    hash.slice(20, 32),
  ].join('-');
  return uuid;
}

/**
 * Generate a unique user ID for a scenario.
 *
 * Generates a valid UUID format for database compatibility.
 * The UUID is deterministic based on scenario ID + random suffix for uniqueness.
 *
 * @example
 * generateScenarioUserId({ scenarioId: 'test-001-basic' })
 * // Returns: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789' (valid UUID)
 */
export function generateScenarioUserId(options: GenerateUserIdOptions): string {
  const { scenarioId, seed } = options;

  // Generate a unique input string for this scenario run
  const uniqueInput = seed
    ? `${AGENTQA_UUID_NAMESPACE}:${scenarioId}:${seed}`
    : `${AGENTQA_UUID_NAMESPACE}:${scenarioId}:${randomUUID()}`;

  return generateDeterministicUuid(uniqueInput);
}

/**
 * Generate a legacy format user ID (non-UUID).
 * Used for backward compatibility or when UUID is not required.
 *
 * Format: agentqa-<scenario-slug>-<uuid-prefix>
 *
 * @example
 * generateLegacyScenarioUserId({ scenarioId: 'test-001-basic' })
 * // Returns: 'agentqa-test001basic-a1b2c3d4'
 */
export function generateLegacyScenarioUserId(options: GenerateUserIdOptions): string {
  const { scenarioId, seed } = options;
  const slug = sanitizeScenarioId(scenarioId);

  // Generate a UUID prefix (or use seed for reproducibility)
  const uuidPrefix = seed
    ? `${seed}00000000`.slice(0, 8)
    : randomUUID().slice(0, 8);

  return `${AGENTQA_USER_PREFIX}-${slug}-${uuidPrefix}`;
}

/**
 * Check if a user ID follows the AgentQA naming pattern.
 *
 * This only checks the legacy format (agentqa-*).
 * For UUID format users, identify by email domain (@agentqa.local).
 */
export function isAgentQaUserId(userId: string): boolean {
  return userId.startsWith(`${AGENTQA_USER_PREFIX}-`);
}

/**
 * Check if an email belongs to an AgentQA test user.
 */
export function isAgentQaEmail(email: string): boolean {
  return email.endsWith('@agentqa.local');
}

/**
 * Extract the scenario slug from an AgentQA user ID.
 */
export function extractScenarioSlug(userId: string): string | null {
  if (!isAgentQaUserId(userId)) {
    return null;
  }

  const parts = userId.split('-');
  if (parts.length < 3) {
    return null;
  }

  // Remove prefix (agentqa) and UUID suffix
  return parts.slice(1, -1).join('-');
}

/**
 * SQL template for creating a test user.
 * Returns the SQL string with placeholders replaced.
 */
export function generateCreateUserSql(options: {
  userId: string;
  clerkUserId?: string;
  email?: string;
  displayName?: string;
}): string {
  const {
    userId,
    clerkUserId = `user_${userId.slice(0, 20)}`,
    email = `${userId}@agentqa.local`,
    displayName = `AgentQA ${userId}`,
  } = options;

  // Escape single quotes in values
  const escape = (s: string) => s.replace(/'/g, "''");

  return `
    INSERT INTO users (id, clerk_user_id, email, display_name)
    VALUES ('${escape(userId)}', '${escape(clerkUserId)}', '${escape(email)}', '${escape(displayName)}')
    ON CONFLICT (id) DO NOTHING;
  `.trim();
}

/**
 * SQL template for deleting a test user and all their data.
 * This cascades through foreign keys to remove all user data.
 *
 * IMPORTANT: Tables must be deleted in correct order to respect foreign keys.
 */
export function generateDeleteUserSql(userId: string): string {
  // Escape single quotes
  const escape = (s: string) => s.replace(/'/g, "''");
  const escapedUserId = escape(userId);

  // Delete in reverse order of dependencies
  // These are the PocketCoach tables that have user_id foreign keys
  const tables = [
    'event_log',
    'pending_reminders',
    'scheduled_reminders',
    'reminder_occurrences',
    'reminders',
    'task_occurrences',
    'recurring_series',
    'tasks',
    'conversation_messages',
    'conversations',
    'goals',
    'user_settings',
    'users',
  ];

  const deleteStatements = tables.map(
    (table) => `DELETE FROM ${table} WHERE user_id = '${escapedUserId}';`
  );

  // Also handle special case where id column is the user_id (users table)
  deleteStatements[deleteStatements.length - 1] = `DELETE FROM users WHERE id = '${escapedUserId}';`;

  return deleteStatements.join('\n');
}

/**
 * User isolation context for a scenario run.
 */
export interface UserIsolationContext {
  /** Generated user ID for this scenario */
  userId: string;
  /** Scenario ID this context is for */
  scenarioId: string;
  /** Whether the user was created (vs using existing) */
  created: boolean;
}

/**
 * Create a user isolation context for a scenario.
 */
export function createUserIsolationContext(
  scenarioId: string,
  seed?: string
): UserIsolationContext {
  return {
    userId: generateScenarioUserId({ scenarioId, seed }),
    scenarioId,
    created: false,
  };
}

/**
 * Options for the user isolation manager.
 */
export interface UserIsolationManagerOptions {
  /** Default user ID to use when isolation is disabled */
  defaultUserId: string;
  /** Whether to enable user isolation (default: true) */
  enabled?: boolean;
}

/**
 * User Isolation Manager for managing scenario user IDs.
 */
export class UserIsolationManager {
  private contexts = new Map<string, UserIsolationContext>();

  constructor(private options: UserIsolationManagerOptions) {}

  /**
   * Get or create a user ID for a scenario.
   */
  getUserId(scenarioId: string): string {
    if (!this.options.enabled) {
      return this.options.defaultUserId;
    }

    let context = this.contexts.get(scenarioId);
    if (!context) {
      context = createUserIsolationContext(scenarioId);
      this.contexts.set(scenarioId, context);
    }

    return context.userId;
  }

  /**
   * Get the context for a scenario.
   */
  getContext(scenarioId: string): UserIsolationContext | undefined {
    return this.contexts.get(scenarioId);
  }

  /**
   * Mark a user as created.
   */
  markCreated(scenarioId: string): void {
    const context = this.contexts.get(scenarioId);
    if (context) {
      context.created = true;
    }
  }

  /**
   * Get all contexts that were created.
   */
  getCreatedContexts(): UserIsolationContext[] {
    return Array.from(this.contexts.values()).filter((c) => c.created);
  }

  /**
   * Clear all contexts.
   */
  clear(): void {
    this.contexts.clear();
  }

  /**
   * Check if isolation is enabled.
   */
  isEnabled(): boolean {
    return this.options.enabled ?? true;
  }

  /**
   * Get the default user ID.
   */
  getDefaultUserId(): string {
    return this.options.defaultUserId;
  }
}

/**
 * Create a user isolation manager.
 */
export function createUserIsolationManager(
  options: UserIsolationManagerOptions
): UserIsolationManager {
  return new UserIsolationManager(options);
}
