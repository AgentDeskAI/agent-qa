/**
 * Tests for suite loading functionality
 */
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { loadSuiteConfig, filterScenarios, getScenarioSummary, getAllTags, groupByTag } from '../scenario/suite.js';
import type { Scenario } from '../scenario/types.js';

describe('Suite Loading', () => {
  const testFixturesDir = resolve(import.meta.dirname, '../../test-fixtures');

  describe('loadSuiteConfig', () => {
    it('should load a suite config file', () => {
      const config = loadSuiteConfig(resolve(testFixturesDir, 'test-suite.yaml'));

      expect(config.name).toBe('Test Suite');
      expect(config.scenarios).toHaveLength(2);
    });
  });

  describe('filterScenarios', () => {
    const scenarios: Scenario[] = [
      {
        id: 'test-001',
        name: 'Create task',
        tags: ['smoke', 'tasks'],
        steps: [],
        source: { file: 'test.yaml' },
      },
      {
        id: 'test-002',
        name: 'Create reminder',
        tags: ['smoke', 'reminders'],
        steps: [],
        source: { file: 'test.yaml' },
      },
      {
        id: 'test-003',
        name: 'Delete task',
        tags: ['tasks'],
        steps: [],
        source: { file: 'test.yaml' },
      },
    ];

    it('should filter by id', () => {
      const filtered = filterScenarios(scenarios, { id: 'test-001' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('test-001');
    });

    it('should filter by tag', () => {
      const filtered = filterScenarios(scenarios, { tags: ['tasks'] });
      expect(filtered).toHaveLength(2);
    });

    it('should filter by multiple tags (intersection)', () => {
      const filtered = filterScenarios(scenarios, { tags: ['smoke', 'tasks'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('test-001');
    });

    it('should filter by grep pattern', () => {
      const filtered = filterScenarios(scenarios, { grep: 'task' });
      expect(filtered).toHaveLength(2);
    });

    it('should combine filters', () => {
      const filtered = filterScenarios(scenarios, { tags: ['smoke'], grep: 'reminder' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('test-002');
    });

    it('should return all when no filters', () => {
      const filtered = filterScenarios(scenarios, {});
      expect(filtered).toHaveLength(3);
    });
  });

  describe('getScenarioSummary', () => {
    it('should return scenario summary string', () => {
      const scenario: Scenario = {
        id: 'test-001',
        name: 'Test Scenario',
        tags: ['smoke'],
        steps: [
          { chat: 'Hello', label: 'step1' },
          { verify: { tasks: [] } },
        ] as any,
        source: { file: 'test.yaml' },
      };

      const summary = getScenarioSummary(scenario);

      // getScenarioSummary returns a string
      expect(summary).toContain('Test Scenario');
      expect(summary).toContain('2 steps');
      expect(summary).toContain('smoke');
    });
  });

  describe('getAllTags', () => {
    it('should collect all unique tags', () => {
      const scenarios: Scenario[] = [
        { id: '1', tags: ['a', 'b'], steps: [], source: { file: 'test.yaml' } },
        { id: '2', tags: ['b', 'c'], steps: [], source: { file: 'test.yaml' } },
        { id: '3', tags: ['c', 'd'], steps: [], source: { file: 'test.yaml' } },
      ];

      const tags = getAllTags(scenarios);

      expect(tags).toHaveLength(4);
      expect(tags).toContain('a');
      expect(tags).toContain('b');
      expect(tags).toContain('c');
      expect(tags).toContain('d');
    });
  });

  describe('groupByTag', () => {
    it('should group scenarios by tag', () => {
      const scenarios: Scenario[] = [
        { id: '1', tags: ['smoke'], steps: [], source: { file: 'test.yaml' } },
        { id: '2', tags: ['smoke', 'e2e'], steps: [], source: { file: 'test.yaml' } },
        { id: '3', tags: ['e2e'], steps: [], source: { file: 'test.yaml' } },
      ];

      const grouped = groupByTag(scenarios);

      expect(grouped.get('smoke')).toHaveLength(2);
      expect(grouped.get('e2e')).toHaveLength(2);
    });
  });
});
