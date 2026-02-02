/**
 * Setup Step Execution
 *
 * Handles execution of scenario setup steps and alias resolution.
 */

import type { ProcessResult } from '../config/types.js';

import type { ScenarioSetupStep, GenericInsertSetupStep, ProcessSetupStep } from './types.js';
import { isInsertStep, isProcessStep } from './types.js';

// =============================================================================
// Alias Registry
// =============================================================================

/**
 * Entry in the alias registry.
 */
export interface AliasEntry {
  /** The entity ID */
  id: string;
  /** The entity type (e.g., 'user', 'reminder') */
  type: string;
}

/**
 * Context for alias resolution.
 */
export interface AliasResolutionContext {
  /** Default user ID */
  userId?: string;
}

/**
 * Registry for managing aliases created during setup.
 */
export interface AliasRegistry {
  /** Set an alias */
  set(name: string, entry: AliasEntry): void;
  /** Get an alias */
  get(name: string): AliasEntry | undefined;
  /** Check if alias exists */
  has(name: string): boolean;
  /** Resolve a value that may be an alias reference */
  resolve(value: string, context: AliasResolutionContext): string;
  /** Get all entries */
  entries(): Map<string, AliasEntry>;
}

/**
 * Create a new alias registry.
 */
export function createAliasRegistry(): AliasRegistry {
  const aliases = new Map<string, AliasEntry>();

  return {
    set(name: string, entry: AliasEntry): void {
      aliases.set(name, entry);
    },

    get(name: string): AliasEntry | undefined {
      return aliases.get(name);
    },

    has(name: string): boolean {
      return aliases.has(name);
    },

    resolve(value: string, context: AliasResolutionContext): string {
      // Not a reference
      if (!value.startsWith('$')) {
        return value;
      }

      const aliasName = value.slice(1);

      // Special case: $userId resolves to default user ID
      if (aliasName === 'userId') {
        if (!context.userId) {
          throw new Error('Cannot resolve $userId: no default userId in context');
        }
        return context.userId;
      }

      // Look up alias
      const entry = aliases.get(aliasName);
      if (!entry) {
        throw new Error(`Unknown alias: ${value}`);
      }

      return entry.id;
    },

    entries(): Map<string, AliasEntry> {
      return new Map(aliases);
    },
  };
}

// =============================================================================
// Setup Executor Interface
// =============================================================================

/**
 * Setup executor interface.
 *
 * Products implement this to handle entity insertion and custom actions.
 * Uses a generic insert method to support any entity type.
 */
export interface SetupExecutor {
  /** Insert any entity type */
  insert(entity: string, data: Record<string, unknown>): Promise<{ id: string }>;

  /** Process a custom action (optional) */
  process?(action: string, id: string): Promise<ProcessResult>;
}


// =============================================================================
// Setup Execution
// =============================================================================

/**
 * Result of running setup steps.
 */
export interface SetupResult {
  /** Whether all steps succeeded */
  success: boolean;
  /** Alias registry with all registered aliases */
  aliases: AliasRegistry;
  /** Error message if failed */
  error?: string;
  /** Index of failed step */
  failedStepIndex?: number;
}

/**
 * Options for running setup steps.
 */
export interface RunSetupOptions {
  /** Setup executor to use */
  executor: SetupExecutor;
  /** Setup steps to run */
  steps: ScenarioSetupStep[];
  /** Default user ID */
  userId: string;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Run setup steps and return the alias registry.
 */
export async function runSetupSteps(options: RunSetupOptions): Promise<SetupResult> {
  const { executor, steps, userId, verbose } = options;
  const aliases = createAliasRegistry();
  const context: AliasResolutionContext = { userId };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    try {
      if (isInsertStep(step)) {
        if (verbose) {
          console.log(`  Setup: Inserting ${step.insert}${step.as ? ` as ${step.as}` : ''}`);
        }

        // Resolve any alias references in data
        const resolvedData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(step.data)) {
          if (typeof value === 'string' && value.startsWith('$')) {
            resolvedData[key] = aliases.resolve(value, context);
          } else {
            resolvedData[key] = value;
          }
        }

        const result = await executor.insert(step.insert, resolvedData);

        if (step.as) {
          aliases.set(step.as, { id: result.id, type: step.insert });
        }
      } else if (isProcessStep(step)) {
        if (!executor.process) {
          throw new Error(`Process action not supported: ${step.process}`);
        }

        const resolvedId = aliases.resolve(step.id, context);

        if (verbose) {
          console.log(`  Setup: Processing ${step.process} ${step.id}`);
        }

        const result = await executor.process(step.process, resolvedId);

        if (!result.success) {
          return {
            success: false,
            aliases,
            error: `Failed to process ${step.process}: ${result.message}`,
            failedStepIndex: i,
          };
        }
      } else {
        throw new Error(`Unknown setup step type: ${JSON.stringify(step)}`);
      }
    } catch (error) {
      return {
        success: false,
        aliases,
        error: error instanceof Error ? error.message : String(error),
        failedStepIndex: i,
      };
    }
  }

  return { success: true, aliases };
}
