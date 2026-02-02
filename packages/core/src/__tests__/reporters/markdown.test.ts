/**
 * Markdown Reporter Tests
 *
 * Tests for the markdown report generator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createMarkdownReporter } from '../../reporters/markdown.js';
import type { ScenarioReport, ChatStepReport, VerifyStepReport, SetupStepReport } from '../../runner/types.js';
import type { Scenario } from '../../scenario/types.js';

// Mock node:fs
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createMockScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'test-scenario',
    steps: [],
    ...overrides,
  };
}

function createMockScenarioReport(overrides: Partial<ScenarioReport> = {}): ScenarioReport {
  return {
    id: 'test-scenario',
    status: 'passed',
    durationMs: 500,
    steps: [],
    captured: {},
    ...overrides,
  };
}

function createMockChatStepReport(overrides: Partial<ChatStepReport> = {}): ChatStepReport {
  return {
    index: 0,
    type: 'chat',
    status: 'passed',
    durationMs: 100,
    assertions: [],
    message: 'Test message',
    ...overrides,
  };
}

function createMockVerifyStepReport(overrides: Partial<VerifyStepReport> = {}): VerifyStepReport {
  return {
    index: 0,
    type: 'verify',
    status: 'passed',
    durationMs: 50,
    assertions: [],
    entitiesVerified: 1,
    ...overrides,
  };
}

function createMockSetupStepReport(overrides: Partial<SetupStepReport> = {}): SetupStepReport {
  return {
    index: 0,
    type: 'setup',
    status: 'passed',
    durationMs: 30,
    assertions: [],
    entitiesInserted: 1,
    aliasesCreated: ['myTask'],
    ...overrides,
  };
}

// =============================================================================
// createMarkdownReporter Tests
// =============================================================================

describe('createMarkdownReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('factory function', () => {
    it('should create a reporter with onScenarioComplete', () => {
      const reporter = createMarkdownReporter({ path: './reports' });

      expect(reporter).toHaveProperty('onScenarioComplete');
      expect(typeof reporter.onScenarioComplete).toBe('function');
    });

    it('should create output directory if not exists', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      createMarkdownReporter({ path: './reports' });

      expect(mkdirSync).toHaveBeenCalledWith('./reports', { recursive: true });
    });

    it('should not create directory if it exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      createMarkdownReporter({ path: './reports' });

      expect(mkdirSync).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // onScenarioComplete Tests
  // =============================================================================

  describe('onScenarioComplete', () => {
    it('should write markdown file for passed scenario', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario({ id: 'test-001' });
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete!(scenario, report);

      expect(writeFileSync).toHaveBeenCalledTimes(1);
      const [filepath, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(filepath).toContain('test-001');
      expect(filepath).toContain('.md');
      expect(content).toContain('# Test Report: test-001');
    });

    it('should skip passed scenarios when onlyOnFailure is true', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        onlyOnFailure: true,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete!(scenario, report);

      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('should write file for failed scenarios when onlyOnFailure is true', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        onlyOnFailure: true,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'failed' });

      reporter.onScenarioComplete!(scenario, report);

      expect(writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('should create parent directory for nested filenames', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        // Main reports dir exists, but subdirs don't
        return path === './reports';
      });
      const reporter = createMarkdownReporter({
        path: './reports',
        filename: '{status}/{id}.md',
      });
      const scenario = createMockScenario({ id: 'test-001' });
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete!(scenario, report);

      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('reports'),
        { recursive: true }
      );
    });
  });

  // =============================================================================
  // Filename Template Tests
  // =============================================================================

  describe('filename template', () => {
    it('should use default filename template', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario({ id: 'my-test' });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [filepath] = vi.mocked(writeFileSync).mock.calls[0];
      expect(filepath).toContain('my-test-');
      expect(filepath).toContain('.md');
    });

    it('should replace {id} placeholder', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        filename: '{id}.md',
      });
      const scenario = createMockScenario({ id: 'scenario-123' });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [filepath] = vi.mocked(writeFileSync).mock.calls[0];
      expect(filepath).toBe('reports/scenario-123.md');
    });

    it('should replace {status} placeholder', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        filename: '{id}-{status}.md',
      });
      const scenario = createMockScenario({ id: 'test' });
      const report = createMockScenarioReport({ status: 'failed' });

      reporter.onScenarioComplete!(scenario, report);

      const [filepath] = vi.mocked(writeFileSync).mock.calls[0];
      expect(filepath).toBe('reports/test-failed.md');
    });

    it('should replace {scenario} placeholder with sanitized name', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        filename: '{scenario}.md',
      });
      const scenario = createMockScenario({ id: 'test', name: 'My Test Scenario!' });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [filepath] = vi.mocked(writeFileSync).mock.calls[0];
      expect(filepath).toBe('reports/My-Test-Scenario-.md');
    });

    it('should replace {timestamp} placeholder', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        filename: '{id}-{timestamp}.md',
      });
      const scenario = createMockScenario({ id: 'test' });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [filepath] = vi.mocked(writeFileSync).mock.calls[0];
      // Timestamp format: YYYY-MM-DDTHH-MM-SS-sssZ
      expect(filepath).toMatch(/test-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.md/);
    });
  });

  // =============================================================================
  // Markdown Content Tests
  // =============================================================================

  describe('markdown content', () => {
    it('should include scenario header', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario({ id: 'test-scenario' });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('# Test Report: test-scenario');
    });

    it('should include status with icon', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Status:** ✅ Passed');
    });

    it('should use failure icon for failed status', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'failed' });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Status:** ❌ Failed');
    });

    it('should include duration', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ durationMs: 1500 });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Duration:** 1.50s');
    });

    it('should format duration in ms for short durations', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ durationMs: 500 });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Duration:** 500ms');
    });

    it('should include scenario name when provided', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario({ name: 'Login Flow Test' });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Name:** Login Flow Test');
    });

    it('should include tags when provided', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario({ tags: ['smoke', 'auth'] });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Tags:** smoke, auth');
    });

    it('should include description when provided', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario({ description: 'Tests the login flow' });
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Description:** Tests the login flow');
    });
  });

  // =============================================================================
  // Token Usage Tests
  // =============================================================================

  describe('token usage', () => {
    it('should include token usage when enabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeUsage: true,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Token Usage:**');
      expect(content).toContain('Input: 100');
      expect(content).toContain('Output: 50');
      expect(content).toContain('Total: 150');
    });

    it('should not include token usage when disabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeUsage: false,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).not.toContain('**Token Usage:**');
    });
  });

  // =============================================================================
  // Step Formatting Tests
  // =============================================================================

  describe('step formatting', () => {
    it('should include steps section', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport()],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('## Steps');
    });

    it('should format chat step with message', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport({ message: 'Create a task' })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Message:** "Create a task"');
    });

    it('should format chat step with response', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport({
          message: 'Test',
          response: 'Task created successfully',
        })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Response:**');
      expect(content).toContain('Task created successfully');
    });

    it('should include tool calls when enabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeToolCalls: true,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport({
          message: 'Test',
          toolCalls: [{ name: 'createTask', args: { title: 'Test' } }],
        })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Tool Calls:**');
      expect(content).toContain('`createTask`');
    });

    it('should not include tool calls when disabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeToolCalls: false,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport({
          message: 'Test',
          toolCalls: [{ name: 'createTask', args: { title: 'Test' } }],
        })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).not.toContain('**Tool Calls:**');
    });

    it('should format verify step', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockVerifyStepReport({ entitiesVerified: 3 })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('Verify');
      expect(content).toContain('**Entities verified:** 3');
    });

    it('should format setup step with aliases', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockSetupStepReport({
          entitiesInserted: 2,
          aliasesCreated: ['task1', 'task2'],
        })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('Setup');
      expect(content).toContain('**Entities inserted:** 2');
      expect(content).toContain('**Aliases:** task1, task2');
    });

    it('should include step error when present', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport({
          status: 'error',
          error: 'Connection timeout',
        })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Error:**');
      expect(content).toContain('Connection timeout');
    });

    it('should include failed assertions', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport({
          status: 'failed',
          assertions: [{
            passed: false,
            message: 'Expected status to be completed',
            expected: 'completed',
            actual: 'pending',
          }],
        })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('**Failed Assertions:**');
      expect(content).toContain('Expected status to be completed');
      expect(content).toContain('Expected: `completed`');
      expect(content).toContain('Actual: `pending`');
    });

    it('should include step label when provided', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [createMockChatStepReport({ label: 'create-task' })],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('`create-task`');
    });
  });

  // =============================================================================
  // Captured Entities Tests
  // =============================================================================

  describe('captured entities', () => {
    it('should include captured entities when enabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeEntities: true,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        captured: { myTask: { id: 'task-123', title: 'Test Task' } },
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('## Captured Entities');
      expect(content).toContain('### myTask');
      expect(content).toContain('"id": "task-123"');
    });

    it('should not include captured entities when disabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeEntities: false,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        captured: { myTask: { id: 'task-123' } },
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).not.toContain('## Captured Entities');
    });

    it('should not include captured section when empty', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeEntities: true,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ captured: {} });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).not.toContain('## Captured Entities');
    });
  });

  // =============================================================================
  // Diagnostics Tests
  // =============================================================================

  describe('diagnostics', () => {
    it('should include diagnostics when enabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeDiagnostics: true,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        status: 'failed',
        diagnostics: [{
          title: 'Tmux Logs',
          content: 'Error: connection refused\nStack trace...',
        }],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('## Diagnostics');
      expect(content).toContain('### Tmux Logs');
      expect(content).toContain('Error: connection refused');
    });

    it('should not include diagnostics when disabled', () => {
      const reporter = createMarkdownReporter({
        path: './reports',
        includeDiagnostics: false,
      });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        status: 'failed',
        diagnostics: [{
          title: 'Logs',
          content: 'Some error',
        }],
      });

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).not.toContain('## Diagnostics');
    });
  });

  // =============================================================================
  // Footer Tests
  // =============================================================================

  describe('footer', () => {
    it('should include generation timestamp', () => {
      const reporter = createMarkdownReporter({ path: './reports' });
      const scenario = createMockScenario();
      const report = createMockScenarioReport();

      reporter.onScenarioComplete!(scenario, report);

      const [, content] = vi.mocked(writeFileSync).mock.calls[0];
      expect(content).toContain('*Generated at');
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
