/**
 * Run Command
 *
 * Execute test suites and scenarios.
 */

import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Command } from 'commander';

import { createHttpAgentFromConfig, createDrizzleAdapter, createMilvusAdapter, createNullDatabaseAdapter } from '../../adapters/index.js';
import type { DatabaseAdapter, VectorStoreAdapter } from '../../adapters/types.js';
import { loadConfigWithRaw, getDiagnosticsMaxLines, hasCustomDatabaseAdapter, getCustomDatabaseAdapter } from '../../config/index.js';
import type { AgentQAConfig } from '../../config/index.js';
import type { ResolvedConfig, ScenarioInfo, ScenarioResultInfo, HookContext } from '../../config/types.js';
import { runGlobalSetup, runTeardown, type TeardownFn } from '../../lifecycle/global-setup.js';
import { quickPreflightCheck } from '../../lifecycle/index.js';
import { createConsoleReporter, reportMultiRunResults, exportMultiRunResults } from '../../reporters/index.js';
import { createTestRunner, executeMultiRun, executeParallel, toSuiteReport } from '../../runner/index.js';
import type { ParallelLifecycleHooks } from '../../runner/parallel-runner.js';
import { loadSuiteConfig, loadSuiteScenarios, filterScenarios } from '../../scenario/suite.js';
import * as output from '../utils/output.js';

/**
 * Run command options.
 */
interface RunOptions {
  id?: string;
  tag?: string;
  grep?: string;
  step?: string;
  verbose?: boolean;
  json?: boolean;
  noTeardown?: boolean;
  skipPreflight?: boolean;
  timeout?: string;
  config?: string;
  bail?: boolean;
  saveDiagnostics?: boolean;
  runs?: string;
  continueOnFailure?: boolean;
  /** Run scenarios in parallel with N workers */
  parallel?: string;
  /** Specific instance ID to use (for cross-suite parallelism) */
  instance?: string;
  /** Disable user isolation (use shared user ID) */
  isolateUsers?: boolean;
}

/**
 * Register the run command.
 */
export function registerRunCommand(program: Command): void {
  program
    .command('run <suite>')
    .description('Run a test suite')
    .option('--id <id>', 'Filter by scenario ID')
    .option('--tag <tag>', 'Filter by tag')
    .option('--grep <pattern>', 'Filter by name pattern')
    .option('--step <label>', 'Run to specific step')
    .option('-v, --verbose', 'Verbose output')
    .option('--json', 'Output results as JSON')
    .option('--no-teardown', 'Keep infrastructure running after tests')
    .option('--skip-preflight', 'Skip infrastructure preflight checks')
    .option('--timeout <ms>', 'Timeout for chat operations (default: 120000)')
    .option('-c, --config <path>', 'Path to config file')
    .option('--bail', 'Stop suite after first failure')
    .option('--save-diagnostics', 'Save diagnostics even on success (for token analysis)')
    .option('--runs <count>', 'Run scenario multiple times for flakiness/hallucination detection')
    .option('--continue-on-failure', 'Continue running remaining iterations even if some fail (default: true)')
    .option('--parallel <n>', 'Run scenarios with N parallel workers (default: 1)')
    .option('--instance <id>', 'Use a specific instance ID (for cross-suite parallelism)')
    .option('--no-isolate-users', 'Use single shared user instead of isolated users per scenario')
    .action(async (suite: string, options: RunOptions) => {
      await runCommand(suite, options);
    });
}

/**
 * Execute the run command.
 */
async function runCommand(suitePath: string, options: RunOptions): Promise<void> {
  let teardown: TeardownFn | undefined;

  try {
    // Load config (loadConfig already resolves env variables)
    const configPath = options.config ? resolve(options.config) : undefined;
    const { resolved: config, raw: rawConfig } = await loadConfigWithRaw(configPath);

    if (options.verbose) {
      output.info(`Using config: ${config.name}`);
    }

    // 1. Run globalSetup if configured (starts infrastructure)
    if (config.globalSetup) {
      if (options.verbose) {
        output.info('Running globalSetup...');
      }

      teardown = await runGlobalSetup(config.globalSetup, {
        verbose: options.verbose,
      });

      if (options.verbose && teardown) {
        output.success('globalSetup complete (teardown registered)');
        console.log('');
      }
    }

    // 2. Run quick preflight check (verify infrastructure is running)
    if (!options.skipPreflight) {
      if (options.verbose) {
        output.info('Running preflight check...');
      }

      const quickCheck = await quickPreflightCheck(config, {
        verbose: options.verbose,
      });

      if (!quickCheck.success) {
        output.error('Preflight checks failed:');
        for (const issue of quickCheck.issues) {
          console.log(`  ✗ ${issue}`);
        }
        // Run teardown before exiting on preflight failure
        if (teardown && !options.noTeardown) {
          await runTeardown(teardown, { verbose: options.verbose });
        }
        process.exit(1);
      }

      if (options.verbose) {
        output.success('Preflight checks passed');
        console.log('');
      }
    }

    // 3. Run hooks.beforeAll
    if (config.hooks?.beforeAll) {
      if (options.verbose) {
        output.info('Running beforeAll hook...');
      }
      await config.hooks.beforeAll();
    }

    // Resolve suite path
    const resolvedSuitePath = resolve(suitePath);

    // Create adapters
    const agent = createHttpAgentFromConfig(config.agent, options.verbose);

    // Create database adapter from config (use NullDatabaseAdapter if not configured)
    let dbConnection: DatabaseConnection;
    if (hasCustomDatabaseAdapter(rawConfig)) {
      // Use custom adapter provided in config
      const customAdapter = getCustomDatabaseAdapter(rawConfig) as DatabaseAdapter;
      dbConnection = { adapter: customAdapter, close: async () => {} };
      if (options.verbose) {
        output.info('Using custom database adapter');
      }
    } else if (config.database) {
      dbConnection = await createDatabaseAdapterFromConfig(config, options.verbose);
    } else {
      dbConnection = { adapter: createNullDatabaseAdapter(), close: async () => {} };
    }

    // Create vector store adapter from config (optional)
    const vectorStoreConnection = await createVectorStoreFromConfig(config, options.verbose);

    // Create runner with hooks
    const runner = createTestRunner(config, {
      agent,
      database: dbConnection.adapter,
      vectorStore: vectorStoreConnection?.adapter,
    });

    // =========================================================================
    // Multi-Run Mode
    // =========================================================================
    // Load scenarios and filter first (needed to check scenario.runs)
    const suiteConfigFile = loadSuiteConfig(resolvedSuitePath);
    let scenarios = loadSuiteScenarios(suiteConfigFile);
    scenarios = filterScenarios(scenarios, {
      id: options.id,
      tags: options.tag ? [options.tag] : undefined,
      grep: options.grep,
    });

    // Determine run count: CLI flag > scenario config > default 1
    // CLI flag is validated only if provided
    let runCount = 1;
    if (options.runs) {
      runCount = parseInt(options.runs, 10);
      if (isNaN(runCount) || runCount < 1) {
        output.exitWithError('--runs must be a positive integer');
        return;
      }
    } else if (scenarios.length === 1 && scenarios[0].runs) {
      // Use scenario-level runs config if single scenario and no CLI flag
      runCount = scenarios[0].runs;
    }

    if (runCount > 1) {
      if (scenarios.length !== 1) {
        output.exitWithError(
          `Multi-run mode requires exactly one scenario. Found ${scenarios.length} scenarios.\n` +
            'Use --id to filter to a single scenario.'
        );
        return;
      }

      const scenario = scenarios[0];

      // Execute multi-run
      const result = await executeMultiRun(runner, scenario, {
        runs: runCount,
        hooks: config.hooks,
        verbose: options.verbose,
        timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
        continueOnFailure: options.continueOnFailure ?? true,
        saveDiagnostics: options.saveDiagnostics,
      });

      // Report results
      reportMultiRunResults(result);

      // Optionally save JSON
      if (options.saveDiagnostics) {
        const outputDir =
          typeof config.diagnostics === 'object' && 'outputDir' in config.diagnostics
            ? config.diagnostics.outputDir
            : './diagnostics-output';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const jsonPath = `${outputDir}/${scenario.id}/multi-run-${timestamp}.json`;
        exportMultiRunResults(result, jsonPath);
        console.log(`\nResults saved to: ${jsonPath}`);
      }

      // 5. Run hooks.afterAll
      if (config.hooks?.afterAll) {
        if (options.verbose) {
          output.info('Running afterAll hook...');
        }
        await config.hooks.afterAll();
      }

      // 6. Close database and vector store connections
      await dbConnection.close();
      if (vectorStoreConnection) {
        await vectorStoreConnection.close();
      }

      // 7. Run teardown if configured and not skipped
      if (teardown && !options.noTeardown) {
        if (options.verbose) {
          output.info('Running teardown...');
        }
        await runTeardown(teardown, { verbose: options.verbose });
      }

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
    }

    // =========================================================================
    // Parallel Mode
    // =========================================================================
    const parallelCount = options.parallel ? parseInt(options.parallel, 10) : 1;
    if (parallelCount > 1) {
      if (isNaN(parallelCount) || parallelCount < 1) {
        output.exitWithError('--parallel must be a positive integer');
        return;
      }

      output.header(`Running ${scenarios.length} scenario(s) with ${parallelCount} parallel workers`);
      output.info('');

      // Convert config hooks to parallel hooks with userId support
      // The parallel hooks receive a userId context that they can use for cleanup
      const parallelHooks: ParallelLifecycleHooks | undefined = config.hooks
        ? {
            beforeEach: config.hooks.beforeEach
              ? async (scenario: ScenarioInfo, context: { userId: string }) => {
                  // Pass the context to the hook so it can use the isolated userId
                  const hookContext: HookContext = { userId: context.userId };
                  await config.hooks!.beforeEach!(scenario, hookContext);
                }
              : undefined,
            afterEach: config.hooks.afterEach
              ? async (scenario: ScenarioInfo, result: ScenarioResultInfo, context: { userId: string }) => {
                  const hookContext: HookContext = { userId: context.userId };
                  await config.hooks!.afterEach!(scenario, result, hookContext);
                }
              : undefined,
          }
        : undefined;

      // Execute in parallel
      const parallelResult = await executeParallel(runner, scenarios, {
        concurrency: parallelCount,
        isolateUsers: options.isolateUsers !== false, // Default to true
        defaultUserId: config.defaultUserId,
        bail: options.bail,
        hooks: parallelHooks,
        verbose: options.verbose,
        onScenarioStart: (scenario, index) => {
          if (options.verbose) {
            output.info(`[${index + 1}/${scenarios.length}] Starting: ${scenario.id}`);
          }
        },
        onScenarioComplete: (scenario, report, index) => {
          const status = report.status === 'passed' ? '\u2713' : '\u2717';
          const durationSec = (report.durationMs / 1000).toFixed(1);
          output.info(`[${index + 1}/${scenarios.length}] ${status} ${scenario.id} (${durationSec}s)`);
        },
      });

      // Convert to SuiteReport format for consistent reporting
      const suiteReport = toSuiteReport(config.name ?? suitePath, parallelResult);

      output.info('');
      output.info('\u2500'.repeat(60));
      output.info('');
      output.info(`Total: ${suiteReport.total} | Passed: ${suiteReport.passed} | Failed: ${suiteReport.failed}`);
      output.info(`Duration: ${(suiteReport.durationMs / 1000).toFixed(1)}s`);

      if (parallelResult.bailed) {
        output.warning('Execution bailed after first failure (--bail)');
      }

      if (parallelResult.userIsolation.isEnabled()) {
        const createdUsers = parallelResult.userIsolation.getCreatedContexts();
        if (createdUsers.length > 0 && options.verbose) {
          output.info('');
          output.info(`User isolation: ${createdUsers.length} unique user(s) created`);
        }
      }

      // 5. Run hooks.afterAll
      if (config.hooks?.afterAll) {
        if (options.verbose) {
          output.info('Running afterAll hook...');
        }
        await config.hooks.afterAll();
      }

      // 6. Close database and vector store connections
      await dbConnection.close();
      if (vectorStoreConnection) {
        await vectorStoreConnection.close();
      }

      // 7. Run teardown if configured and not skipped
      if (teardown && !options.noTeardown) {
        if (options.verbose) {
          output.info('Running teardown...');
        }
        await runTeardown(teardown, { verbose: options.verbose });
      }

      // Exit with appropriate code
      process.exit(parallelResult.success ? 0 : 1);
    }

    // =========================================================================
    // Normal Single-Run Mode
    // =========================================================================

    // Create reporter with configurable truncation
    const reporter = createConsoleReporter({
      verbose: options.verbose,
      showToolCalls: options.verbose,
      showUsage: true,
      showDiagnostics: options.verbose,
      maxDiagnosticLines: getDiagnosticsMaxLines(config.diagnostics),
    });

    // 4. Run suite with hooks
    const runOptions = {
      id: options.id,
      tags: options.tag ? [options.tag] : undefined,
      grep: options.grep,
      targetStep: options.step,
      verbose: options.verbose,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      hooks: config.hooks,
      stopOnFailure: options.bail,
      saveDiagnostics: options.saveDiagnostics,
    };

    // Report suite start
    const suiteConfig = { name: config.name, scenarios: [] as string[] };
    reporter.onSuiteStart?.(suiteConfig);

    const result = await runner.runSuite(resolvedSuitePath, runOptions);

    // Report each scenario (for diagnostics display)
    if (result.report) {
      for (const scenarioReport of result.report.scenarios) {
        // Create a minimal scenario object for the reporter
        const scenario = {
          id: scenarioReport.id,
          name: scenarioReport.name,
          steps: [],
        };
        reporter.onScenarioComplete?.(scenario as never, scenarioReport);
      }

      // Report suite complete
      reporter.onSuiteComplete?.(result.report);
    }

    reporter.finalize?.();

    // 5. Run hooks.afterAll
    if (config.hooks?.afterAll) {
      if (options.verbose) {
        output.info('Running afterAll hook...');
      }
      await config.hooks.afterAll();
    }

    // 6. Close database and vector store connections
    await dbConnection.close();
    if (vectorStoreConnection) {
      await vectorStoreConnection.close();
    }

    // 7. Run teardown if configured and not skipped
    if (teardown && !options.noTeardown) {
      if (options.verbose) {
        output.info('Running teardown...');
      }
      await runTeardown(teardown, { verbose: options.verbose });
    }

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    // Attempt teardown on error
    if (teardown && !options.noTeardown) {
      try {
        await runTeardown(teardown, { verbose: options.verbose });
      } catch {
        // Ignore teardown errors during error handling
      }
    }

    output.exitWithError(
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Database connection wrapper.
 */
interface DatabaseConnection {
  adapter: DatabaseAdapter;
  close: () => Promise<void>;
}

/**
 * Create a database adapter from config.
 *
 * Creates a PostgreSQL connection and Drizzle ORM instance,
 * then wraps it with the Drizzle adapter.
 */
async function createDatabaseAdapterFromConfig(
  config: ResolvedConfig,
  verbose?: boolean
): Promise<DatabaseConnection> {
  if (!config.database?.url) {
    throw new Error(
      'Database URL not configured. Add database.url to your agentqa.config.ts'
    );
  }

  if (!config.database?.entities || config.database.entities.length === 0) {
    throw new Error(
      'No entities configured. Add database.entities to your agentqa.config.ts'
    );
  }

  // Create PostgreSQL connection
  const client = postgres(config.database.url);

  // Create Drizzle ORM instance
  const db = drizzle(client);

  // Create adapter
  const adapter = createDrizzleAdapter({
    db,
    entities: config.database.entities,
    defaultUserIdColumn: config.database.defaultUserIdColumn,
    verbose,
  });

  return {
    adapter,
    close: async () => {
      await client.end();
    },
  };
}

/**
 * Vector store connection wrapper.
 */
interface VectorStoreConnection {
  adapter: VectorStoreAdapter;
  close: () => Promise<void>;
}

/**
 * Create a vector store adapter from config.
 *
 * Creates a Milvus client and wraps it with the Milvus adapter.
 * Returns null if vectorStore is not configured.
 */
async function createVectorStoreFromConfig(
  config: ResolvedConfig,
  verbose?: boolean,
): Promise<VectorStoreConnection | null> {
  if (!config.vectorStore) {
    return null;
  }

  const { host, port, verbose: vectorVerbose } = config.vectorStore;
  const address = `${host}:${port}`;

  if (verbose) {
    console.log(`Connecting to Milvus at ${address}...`);
  }

  // Dynamically import Milvus SDK (it's an optional dependency)
  const { MilvusClient } = await import('@zilliz/milvus2-sdk-node');
  const client = new MilvusClient({ address });

  // Verify connection with health check
  try {
    const health = await client.checkHealth();
    if (!health.isHealthy) {
      console.warn('Warning: Milvus not healthy, verifyVectors steps may fail');
    } else if (verbose) {
      console.log('Milvus connection established');
    }
  } catch (error) {
    console.warn(
      `Warning: Could not verify Milvus health: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const adapter = createMilvusAdapter({
    client,
    verbose: vectorVerbose ?? verbose,
  });

  return {
    adapter,
    close: async () => {
      await client.closeConnection();
    },
  };
}
