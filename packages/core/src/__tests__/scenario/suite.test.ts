/**
 * Additional Suite Loader Tests
 *
 * Tests for suite loading edge cases and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  loadSuiteConfig,
  loadSuiteScenarios,
  filterScenarios,
  truncateToStep,
  getScenarioSummary,
  getAllTags,
  groupByTag,
  findStepByLabel,
  getStepIndex,
} from '../../scenario/suite.js';
import { ParseError } from '../../scenario/parser.js';
import type { Scenario, SuiteConfig, Step } from '../../scenario/types.js';

// =============================================================================
// Mock fs and path modules
// =============================================================================

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

// =============================================================================
// Tests
// =============================================================================

describe('Suite Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // loadSuiteConfig
  // ===========================================================================

  describe('loadSuiteConfig', () => {
    it('should load suite with all fields', () => {
      const yaml = `
name: Full Suite
scenarios:
  - test-001.yaml
  - test-002.yaml
defaultTags:
  - smoke
  - regression
defaultTimeout: 60
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.name).toBe('Full Suite');
      expect(config.scenarios).toEqual(['test-001.yaml', 'test-002.yaml']);
      expect(config.defaultTags).toEqual(['smoke', 'regression']);
      expect(config.defaultTimeout).toBe(60);
    });

    it('should handle missing optional fields', () => {
      const yaml = `
scenarios:
  - test.yaml
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.name).toBeUndefined();
      expect(config.defaultTags).toBeUndefined();
      expect(config.defaultTimeout).toBeUndefined();
    });

    it('should filter non-string scenarios', () => {
      const yaml = `
scenarios:
  - test.yaml
  - 123
  - another.yaml
  - null
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.scenarios).toEqual(['test.yaml', 'another.yaml']);
    });

    it('should filter non-string defaultTags', () => {
      const yaml = `
scenarios:
  - test.yaml
defaultTags:
  - smoke
  - 123
  - regression
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.defaultTags).toEqual(['smoke', 'regression']);
    });

    it('should handle non-array scenarios', () => {
      const yaml = `
name: Bad Suite
scenarios: "not an array"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.scenarios).toEqual([]);
    });

    it('should throw ParseError on file read error', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      expect(() => loadSuiteConfig('/missing/suite.yaml')).toThrow(ParseError);
      expect(() => loadSuiteConfig('/missing/suite.yaml')).toThrow(
        /Failed to load suite/
      );
    });

    it('should throw ParseError on invalid YAML', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid: yaml: content: [');

      expect(() => loadSuiteConfig('/path/to/suite.yaml')).toThrow(ParseError);
    });

    it('should set baseDir from suite path', () => {
      const yaml = `
scenarios:
  - test.yaml
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suites/my-suite.yaml');

      expect(config.baseDir).toBe('/path/to/suites');
    });

    it('should handle non-number defaultTimeout', () => {
      const yaml = `
scenarios:
  - test.yaml
defaultTimeout: "not a number"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.defaultTimeout).toBeUndefined();
    });

    it('should handle non-string name', () => {
      const yaml = `
name: 123
scenarios:
  - test.yaml
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.name).toBeUndefined();
    });

    it('should handle non-array defaultTags', () => {
      const yaml = `
scenarios:
  - test.yaml
defaultTags: "smoke"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const config = loadSuiteConfig('/path/to/suite.yaml');

      expect(config.defaultTags).toBeUndefined();
    });
  });

  // ===========================================================================
  // loadSuiteScenarios
  // ===========================================================================

  describe('loadSuiteScenarios', () => {
    it('should load scenarios from direct file paths', () => {
      const scenarioYaml = `
id: test-001
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(scenarioYaml);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);

      const config: SuiteConfig = {
        scenarios: ['test-001.yaml'],
        baseDir: '/base',
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios).toHaveLength(1);
      expect(scenarios[0].id).toBe('test-001');
    });

    it('should apply default tags to scenarios', () => {
      const scenarioYaml = `
id: test-001
tags:
  - existing
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(scenarioYaml);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);

      const config: SuiteConfig = {
        scenarios: ['test-001.yaml'],
        baseDir: '/base',
        defaultTags: ['default-tag'],
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios[0].tags).toContain('existing');
      expect(scenarios[0].tags).toContain('default-tag');
    });

    it('should apply default timeout when scenario has none', () => {
      const scenarioYaml = `
id: test-001
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(scenarioYaml);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);

      const config: SuiteConfig = {
        scenarios: ['test-001.yaml'],
        baseDir: '/base',
        defaultTimeout: 120,
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios[0].timeout).toBe(120);
    });

    it('should not override scenario timeout with default', () => {
      const scenarioYaml = `
id: test-001
timeout: 60
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(scenarioYaml);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);

      const config: SuiteConfig = {
        scenarios: ['test-001.yaml'],
        baseDir: '/base',
        defaultTimeout: 120,
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios[0].timeout).toBe(60);
    });

    it('should load scenarios from directory', () => {
      const scenarioYaml = `
id: test-from-dir
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(scenarioYaml);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => false,
        isDirectory: () => true,
      } as fs.Stats);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'test-001.yaml',
        'test-002.yaml',
        'readme.md',
        'test-003.yml',
      ] as any);

      const config: SuiteConfig = {
        scenarios: ['scenarios/'],
        baseDir: '/base',
      };

      const scenarios = loadSuiteScenarios(config);

      // Should load 3 YAML files (test-001.yaml, test-002.yaml, test-003.yml)
      expect(scenarios).toHaveLength(3);
    });

    it('should handle glob patterns', () => {
      const scenarioYaml = `
id: test-glob
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(scenarioYaml);
      vi.mocked(fs.statSync).mockImplementation(() => {
        const error = new Error('ENOENT');
        throw error;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        'test-001.yaml',
        'test-002.yaml',
        'other-001.yaml',
      ] as any);

      const config: SuiteConfig = {
        scenarios: ['test-*.yaml'],
        baseDir: '/base',
      };

      const scenarios = loadSuiteScenarios(config);

      // Should match test-001.yaml and test-002.yaml
      expect(scenarios).toHaveLength(2);
    });

    it('should re-throw ParseError from scenario loading', () => {
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid yaml [');

      const config: SuiteConfig = {
        scenarios: ['test.yaml'],
        baseDir: '/base',
      };

      expect(() => loadSuiteScenarios(config)).toThrow(ParseError);
    });

    it('should use cwd when baseDir not specified', () => {
      const scenarioYaml = `
id: test-001
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(scenarioYaml);
      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as fs.Stats);

      const config: SuiteConfig = {
        scenarios: ['test.yaml'],
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios).toHaveLength(1);
    });

    it('should return empty array for non-matching glob', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const config: SuiteConfig = {
        scenarios: ['no-match-*.yaml'],
        baseDir: '/base',
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios).toEqual([]);
    });

    it('should handle glob directory read error', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const config: SuiteConfig = {
        scenarios: ['dir/*.yaml'],
        baseDir: '/base',
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios).toEqual([]);
    });

    it('should handle non-existent pattern', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const config: SuiteConfig = {
        scenarios: ['nonexistent.yaml'],
        baseDir: '/base',
      };

      const scenarios = loadSuiteScenarios(config);

      expect(scenarios).toEqual([]);
    });
  });

  // ===========================================================================
  // truncateToStep
  // ===========================================================================

  describe('truncateToStep', () => {
    const scenario: Scenario = {
      id: 'test-001',
      steps: [
        { label: 'step1', chat: 'First' } as Step,
        { label: 'step2', chat: 'Second' } as Step,
        { label: 'step3', chat: 'Third' } as Step,
      ],
      source: { file: 'test.yaml' },
    };

    it('should truncate to first step', () => {
      const truncated = truncateToStep(scenario, 'step1');

      expect(truncated.steps).toHaveLength(1);
      expect(truncated.steps[0].label).toBe('step1');
    });

    it('should truncate to middle step', () => {
      const truncated = truncateToStep(scenario, 'step2');

      expect(truncated.steps).toHaveLength(2);
      expect(truncated.steps[1].label).toBe('step2');
    });

    it('should include all steps when truncating to last step', () => {
      const truncated = truncateToStep(scenario, 'step3');

      expect(truncated.steps).toHaveLength(3);
    });

    it('should throw when step not found', () => {
      expect(() => truncateToStep(scenario, 'nonexistent')).toThrow(
        /Step "nonexistent" not found/
      );
    });

    it('should preserve other scenario properties', () => {
      const fullScenario: Scenario = {
        ...scenario,
        name: 'Test Scenario',
        tags: ['smoke'],
        description: 'A test',
      };

      const truncated = truncateToStep(fullScenario, 'step1');

      expect(truncated.name).toBe('Test Scenario');
      expect(truncated.tags).toEqual(['smoke']);
      expect(truncated.description).toBe('A test');
    });
  });

  // ===========================================================================
  // findStepByLabel
  // ===========================================================================

  describe('findStepByLabel', () => {
    const scenario: Scenario = {
      id: 'test-001',
      steps: [
        { label: 'first', chat: 'Hello' } as Step,
        { label: 'second', chat: 'World' } as Step,
        { chat: 'No label' } as Step,
      ],
      source: { file: 'test.yaml' },
    };

    it('should find step by label', () => {
      const step = findStepByLabel(scenario, 'first');

      expect(step).toBeDefined();
      expect(step?.label).toBe('first');
    });

    it('should return undefined when label not found', () => {
      const step = findStepByLabel(scenario, 'nonexistent');

      expect(step).toBeUndefined();
    });

    it('should find first step without label when searching for undefined', () => {
      // When searching for undefined label, findIndex will match steps that have label=undefined
      const step = findStepByLabel(scenario, undefined as unknown as string);

      // The third step has no label (undefined), so it matches undefined search
      expect(step).toBeDefined();
      expect((step as any).chat).toBe('No label');
    });
  });

  // ===========================================================================
  // getStepIndex
  // ===========================================================================

  describe('getStepIndex', () => {
    const scenario: Scenario = {
      id: 'test-001',
      steps: [
        { label: 'first', chat: 'Hello' } as Step,
        { label: 'second', chat: 'World' } as Step,
        { chat: 'No label' } as Step,
      ],
      source: { file: 'test.yaml' },
    };

    it('should return index of first step', () => {
      const index = getStepIndex(scenario, 'first');
      expect(index).toBe(0);
    });

    it('should return index of second step', () => {
      const index = getStepIndex(scenario, 'second');
      expect(index).toBe(1);
    });

    it('should return -1 when label not found', () => {
      const index = getStepIndex(scenario, 'nonexistent');
      expect(index).toBe(-1);
    });
  });

  // ===========================================================================
  // getScenarioSummary edge cases
  // ===========================================================================

  describe('getScenarioSummary', () => {
    it('should use id when name is missing', () => {
      const scenario: Scenario = {
        id: 'test-001',
        steps: [{ chat: 'Hello' } as Step],
        source: { file: 'test.yaml' },
      };

      const summary = getScenarioSummary(scenario);

      expect(summary).toContain('test-001');
    });

    it('should handle scenario without tags', () => {
      const scenario: Scenario = {
        id: 'test-001',
        name: 'Test',
        steps: [{ chat: 'Hello' } as Step],
        source: { file: 'test.yaml' },
      };

      const summary = getScenarioSummary(scenario);

      expect(summary).not.toContain('tags:');
    });

    it('should handle empty steps', () => {
      const scenario: Scenario = {
        id: 'test-001',
        steps: [],
        source: { file: 'test.yaml' },
      };

      const summary = getScenarioSummary(scenario);

      expect(summary).toContain('0 steps');
    });
  });

  // ===========================================================================
  // getAllTags edge cases
  // ===========================================================================

  describe('getAllTags', () => {
    it('should handle scenarios without tags', () => {
      const scenarios: Scenario[] = [
        { id: '1', steps: [], source: { file: 'test.yaml' } },
        { id: '2', tags: ['a'], steps: [], source: { file: 'test.yaml' } },
      ];

      const tags = getAllTags(scenarios);

      expect(tags).toEqual(['a']);
    });

    it('should return empty for no scenarios', () => {
      const tags = getAllTags([]);
      expect(tags).toEqual([]);
    });

    it('should sort tags alphabetically', () => {
      const scenarios: Scenario[] = [
        { id: '1', tags: ['z', 'a', 'm'], steps: [], source: { file: 'test.yaml' } },
      ];

      const tags = getAllTags(scenarios);

      expect(tags).toEqual(['a', 'm', 'z']);
    });
  });

  // ===========================================================================
  // groupByTag edge cases
  // ===========================================================================

  describe('groupByTag', () => {
    it('should group untagged scenarios under "untagged"', () => {
      const scenarios: Scenario[] = [
        { id: '1', steps: [], source: { file: 'test.yaml' } },
        { id: '2', steps: [], source: { file: 'test.yaml' } },
      ];

      const grouped = groupByTag(scenarios);

      expect(grouped.get('untagged')).toHaveLength(2);
    });

    it('should handle empty scenarios array', () => {
      const grouped = groupByTag([]);

      expect(grouped.size).toBe(0);
    });

    it('should handle scenario with empty tags array', () => {
      // Empty tags array means no tags, so scenario doesn't appear in any group
      // (only undefined/null tags trigger 'untagged' fallback)
      const scenarios: Scenario[] = [
        { id: '1', tags: [], steps: [], source: { file: 'test.yaml' } },
      ];

      const grouped = groupByTag(scenarios);

      // No groups created since empty array means the for..of loop doesn't execute
      expect(grouped.size).toBe(0);
    });
  });

  // ===========================================================================
  // filterScenarios edge cases
  // ===========================================================================

  describe('filterScenarios', () => {
    const scenarios: Scenario[] = [
      {
        id: 'test-001',
        name: 'Create Task',
        description: 'Creates a new task',
        tags: ['smoke'],
        steps: [],
        source: { file: 'test.yaml' },
      },
      {
        id: 'test-002',
        tags: ['regression'],
        steps: [],
        source: { file: 'test.yaml' },
      },
    ];

    it('should match grep against name', () => {
      const filtered = filterScenarios(scenarios, { grep: 'Create' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('test-001');
    });

    it('should match grep against description', () => {
      const filtered = filterScenarios(scenarios, { grep: 'Creates' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('test-001');
    });

    it('should use id when name is missing for grep', () => {
      const filtered = filterScenarios(scenarios, { grep: 'test-002' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('test-002');
    });

    it('should handle scenario without description for grep', () => {
      const filtered = filterScenarios(scenarios, { grep: 'test-002' });

      expect(filtered).toHaveLength(1);
    });

    it('should handle scenario without tags for tag filter', () => {
      const noTagsScenarios: Scenario[] = [
        { id: '1', steps: [], source: { file: 'test.yaml' } },
      ];

      const filtered = filterScenarios(noTagsScenarios, { tags: ['smoke'] });

      expect(filtered).toHaveLength(0);
    });
  });
});
