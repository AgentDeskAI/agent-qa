/**
 * Suite Management
 *
 * Load and filter test suites and scenarios.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { parseScenarioFile, ParseError } from './parser.js';
import type { Scenario, SuiteConfig, FilterOptions, Step } from './types.js';

/**
 * Load a suite configuration from a YAML file.
 */
export function loadSuiteConfig(suitePath: string): SuiteConfig {
  const absolutePath = resolve(suitePath);

  try {
    const content = readFileSync(absolutePath, 'utf-8');
    const raw = parseYaml(content) as Record<string, unknown>;

    return {
      name: typeof raw.name === 'string' ? raw.name : undefined,
      scenarios: Array.isArray(raw.scenarios)
        ? raw.scenarios.filter((s): s is string => typeof s === 'string')
        : [],
      baseDir: dirname(absolutePath),
      defaultTags: Array.isArray(raw.defaultTags)
        ? raw.defaultTags.filter((t): t is string => typeof t === 'string')
        : undefined,
      defaultTimeout:
        typeof raw.defaultTimeout === 'number' ? raw.defaultTimeout : undefined,
    };
  } catch (error) {
    throw new ParseError(
      `Failed to load suite: ${error instanceof Error ? error.message : String(error)}`,
      { file: absolutePath }
    );
  }
}

/**
 * Load all scenarios from a suite configuration.
 */
export function loadSuiteScenarios(config: SuiteConfig): Scenario[] {
  const scenarios: Scenario[] = [];
  const baseDir = config.baseDir ?? process.cwd();

  for (const pattern of config.scenarios) {
    const files = resolveScenarioPattern(pattern, baseDir);

    for (const file of files) {
      try {
        const scenario = parseScenarioFile(file);

        // Apply default tags
        if (config.defaultTags && config.defaultTags.length > 0) {
          scenario.tags = [...(scenario.tags ?? []), ...config.defaultTags];
        }

        // Apply default timeout
        if (config.defaultTimeout && !scenario.timeout) {
          scenario.timeout = config.defaultTimeout;
        }

        scenarios.push(scenario);
      } catch (error) {
        // Re-throw parse errors
        if (error instanceof ParseError) {
          throw error;
        }
        throw new ParseError(
          `Failed to load scenario: ${error instanceof Error ? error.message : String(error)}`,
          { file }
        );
      }
    }
  }

  return scenarios;
}

/**
 * Resolve a scenario pattern to file paths.
 *
 * Supports:
 * - Direct file paths: "test-001.yaml"
 * - Directory paths: "scenarios/" (loads all .yaml files)
 * - Glob patterns: "test-*.yaml" (simple glob support)
 */
function resolveScenarioPattern(pattern: string, baseDir: string): string[] {
  const absolutePattern = join(baseDir, pattern);

  // Check if it's a direct file
  try {
    const stat = statSync(absolutePattern);
    if (stat.isFile()) {
      return [absolutePattern];
    }
    if (stat.isDirectory()) {
      // Load all YAML files from directory
      return readdirSync(absolutePattern)
        .filter((f) => extname(f) === '.yaml' || extname(f) === '.yml')
        .map((f) => join(absolutePattern, f))
        .sort();
    }
  } catch {
    // Path doesn't exist, try glob matching
  }

  // Simple glob matching
  if (pattern.includes('*')) {
    return matchGlob(pattern, baseDir);
  }

  // Pattern doesn't match anything
  return [];
}

/**
 * Simple glob matching for scenario patterns.
 */
function matchGlob(pattern: string, baseDir: string): string[] {
  const dir = dirname(pattern);
  const filePattern = basename(pattern);
  const searchDir = join(baseDir, dir);

  try {
    const files = readdirSync(searchDir);
    const regex = globToRegex(filePattern);

    return files
      .filter((f) => regex.test(f))
      .filter((f) => extname(f) === '.yaml' || extname(f) === '.yml')
      .map((f) => join(searchDir, f))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Convert a simple glob pattern to a regex.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/**
 * Filter scenarios based on options.
 */
export function filterScenarios(
  scenarios: Scenario[],
  options: FilterOptions
): Scenario[] {
  let filtered = [...scenarios];

  // Filter by ID
  if (options.id) {
    filtered = filtered.filter((s) => s.id === options.id);
  }

  // Filter by tags (must have all specified tags)
  if (options.tags && options.tags.length > 0) {
    filtered = filtered.filter((s) => {
      const scenarioTags = s.tags ?? [];
      return options.tags!.every((tag) => scenarioTags.includes(tag));
    });
  }

  // Filter by grep (name or description match)
  if (options.grep) {
    const regex = new RegExp(options.grep, 'i');
    filtered = filtered.filter((s) => {
      const name = s.name ?? s.id;
      const description = s.description ?? '';
      return regex.test(name) || regex.test(description);
    });
  }

  return filtered;
}

/**
 * Truncate a scenario to run only up to a target step.
 */
export function truncateToStep(scenario: Scenario, targetStep: string): Scenario {
  const targetIndex = scenario.steps.findIndex((s) => s.label === targetStep);

  if (targetIndex === -1) {
    throw new Error(`Step "${targetStep}" not found in scenario "${scenario.id}"`);
  }

  return {
    ...scenario,
    steps: scenario.steps.slice(0, targetIndex + 1),
  };
}

/**
 * Get a summary of a scenario for logging.
 */
export function getScenarioSummary(scenario: Scenario): string {
  const name = scenario.name ?? scenario.id;
  const stepCount = scenario.steps.length;
  const tags = scenario.tags?.join(', ') ?? '';

  return `${name} (${stepCount} steps${tags ? `, tags: ${tags}` : ''})`;
}

/**
 * Get all unique tags from scenarios.
 */
export function getAllTags(scenarios: Scenario[]): string[] {
  const tags = new Set<string>();
  for (const scenario of scenarios) {
    for (const tag of scenario.tags ?? []) {
      tags.add(tag);
    }
  }
  return [...tags].sort();
}

/**
 * Group scenarios by tag.
 */
export function groupByTag(scenarios: Scenario[]): Map<string, Scenario[]> {
  const groups = new Map<string, Scenario[]>();

  for (const scenario of scenarios) {
    for (const tag of scenario.tags ?? ['untagged']) {
      const group = groups.get(tag) ?? [];
      group.push(scenario);
      groups.set(tag, group);
    }
  }

  return groups;
}

/**
 * Find a step by label in a scenario.
 */
export function findStepByLabel(scenario: Scenario, label: string): Step | undefined {
  return scenario.steps.find((s) => s.label === label);
}

/**
 * Get the index of a step by label.
 */
export function getStepIndex(scenario: Scenario, label: string): number {
  return scenario.steps.findIndex((s) => s.label === label);
}
