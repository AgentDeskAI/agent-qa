/**
 * Console Reporter Tests
 *
 * Tests for the colored terminal output reporter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { ConsoleReporter, createConsoleReporter } from '../../reporters/console.js';
import type { ScenarioReport, StepReport, SuiteReport, ChatStepReport } from '../../runner/types.js';
import type { Scenario, SuiteConfig, Step } from '../../scenario/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock writable stream that captures output.
 */
function createMockStream(): { stream: Writable; getOutput: () => string } {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  return {
    stream,
    getOutput: () => output,
  };
}

function createMockSuiteConfig(overrides: Partial<SuiteConfig> = {}): SuiteConfig {
  return {
    name: 'Test Suite',
    scenarios: [],
    ...overrides,
  };
}

function createMockScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'test-scenario',
    steps: [],
    ...overrides,
  };
}

function createMockStep(overrides: Partial<Step> = {}): Step {
  return {
    chat: 'Test message',
    ...overrides,
  } as Step;
}

function createMockStepReport(overrides: Partial<StepReport> = {}): StepReport {
  return {
    index: 0,
    type: 'chat',
    status: 'passed',
    durationMs: 100,
    assertions: [],
    message: 'Test message',
    ...overrides,
  } as StepReport;
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

function createMockSuiteReport(overrides: Partial<SuiteReport> = {}): SuiteReport {
  return {
    total: 3,
    passed: 2,
    failed: 1,
    skipped: 0,
    errors: 0,
    durationMs: 1500,
    scenarios: [],
    startedAt: new Date(),
    endedAt: new Date(),
    ...overrides,
  };
}

/**
 * Strip ANSI color codes from string for easier testing.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// =============================================================================
// ConsoleReporter Constructor Tests
// =============================================================================

describe('ConsoleReporter', () => {
  describe('constructor', () => {
    it('should create reporter with default options', () => {
      const reporter = new ConsoleReporter();
      expect(reporter).toBeInstanceOf(ConsoleReporter);
    });

    it('should accept custom stream', () => {
      const { stream } = createMockStream();
      const reporter = new ConsoleReporter({ stream });
      expect(reporter).toBeDefined();
    });

    it('should accept colors option', () => {
      const reporter = new ConsoleReporter({ colors: false });
      expect(reporter).toBeDefined();
    });

    it('should accept verbose option', () => {
      const reporter = new ConsoleReporter({ verbose: true });
      expect(reporter).toBeDefined();
    });
  });

  // =============================================================================
  // onSuiteStart Tests
  // =============================================================================

  describe('onSuiteStart', () => {
    it('should print suite header', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const suite = createMockSuiteConfig({ name: 'My Test Suite' });

      reporter.onSuiteStart(suite);

      const output = getOutput();
      expect(output).toContain('Running suite: My Test Suite');
    });

    it('should print separator line', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const suite = createMockSuiteConfig();

      reporter.onSuiteStart(suite);

      const output = getOutput();
      expect(output).toContain('─'.repeat(60));
    });

    it('should handle unnamed suite', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const suite = createMockSuiteConfig({ name: undefined });

      reporter.onSuiteStart(suite);

      const output = getOutput();
      expect(output).toContain('Unnamed Suite');
    });
  });

  // =============================================================================
  // onScenarioStart Tests
  // =============================================================================

  describe('onScenarioStart', () => {
    it('should print scenario name', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario({ name: 'Login Flow Test' });

      reporter.onScenarioStart(scenario);

      const output = getOutput();
      expect(output).toContain('Login Flow Test');
    });

    it('should fallback to scenario id when no name', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario({ id: 'test-123', name: undefined });

      reporter.onScenarioStart(scenario);

      const output = getOutput();
      expect(output).toContain('test-123');
    });
  });

  // =============================================================================
  // onStepComplete Tests
  // =============================================================================

  describe('onStepComplete', () => {
    describe('compact mode (non-verbose)', () => {
      it('should print dot for passed step', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false });
        const step = createMockStep();
        const report = createMockStepReport({ status: 'passed' });

        reporter.onStepComplete(step, report);

        expect(getOutput()).toContain('.');
      });

      it('should print F for failed step', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false });
        const step = createMockStep();
        const report = createMockStepReport({ status: 'failed' });

        reporter.onStepComplete(step, report);

        expect(getOutput()).toContain('F');
      });

      it('should print E for error step', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false });
        const step = createMockStep();
        const report = createMockStepReport({ status: 'error' });

        reporter.onStepComplete(step, report);

        expect(getOutput()).toContain('E');
      });

      it('should print S for skipped step', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false });
        const step = createMockStep();
        const report = createMockStepReport({ status: 'skipped' });

        reporter.onStepComplete(step, report);

        expect(getOutput()).toContain('S');
      });
    });

    describe('verbose mode', () => {
      it('should print step label and duration', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false, verbose: true });
        const step = createMockStep();
        const report = createMockStepReport({ label: 'Create Task', durationMs: 150 });

        reporter.onStepComplete(step, report);

        const output = getOutput();
        expect(output).toContain('Create Task');
        expect(output).toContain('150ms');
      });

      it('should show message for chat steps', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false, verbose: true });
        const step = createMockStep();
        const report = createMockStepReport({
          type: 'chat',
          message: 'Create a new task',
        } as Partial<ChatStepReport>);

        reporter.onStepComplete(step, report);

        const output = getOutput();
        expect(output).toContain('Create a new task');
      });

      it('should show tool calls when enabled', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({
          stream,
          colors: false,
          verbose: true,
          showToolCalls: true,
        });
        const step = createMockStep();
        const report = createMockStepReport({
          type: 'chat',
          message: 'Test',
          toolCalls: [{ name: 'createTask', args: { title: 'Test' } }],
        } as Partial<ChatStepReport>);

        reporter.onStepComplete(step, report);

        const output = getOutput();
        expect(output).toContain('Tools: createTask');
      });

      it('should show response when present', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false, verbose: true });
        const step = createMockStep();
        const report = createMockStepReport({
          type: 'chat',
          message: 'Test',
          response: 'Task created successfully',
        } as Partial<ChatStepReport>);

        reporter.onStepComplete(step, report);

        const output = getOutput();
        expect(output).toContain('Task created successfully');
      });

      it('should show error when present', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false, verbose: true });
        const step = createMockStep();
        const report = createMockStepReport({
          status: 'error',
          error: 'Connection timeout',
        });

        reporter.onStepComplete(step, report);

        const output = getOutput();
        expect(output).toContain('Error: Connection timeout');
      });

      it('should truncate long messages', () => {
        const { stream, getOutput } = createMockStream();
        const reporter = new ConsoleReporter({ stream, colors: false, verbose: true });
        const step = createMockStep();
        const longMessage = 'A'.repeat(100);
        const report = createMockStepReport({
          type: 'chat',
          message: longMessage,
        } as Partial<ChatStepReport>);

        reporter.onStepComplete(step, report);

        const output = getOutput();
        expect(output).toContain('...');
      });
    });
  });

  // =============================================================================
  // onScenarioComplete Tests
  // =============================================================================

  describe('onScenarioComplete', () => {
    it('should print scenario status', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('PASSED');
    });

    it('should print duration', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ durationMs: 1234 });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('1234ms');
    });

    it('should print step count', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        steps: [
          createMockStepReport(),
          createMockStepReport(),
          createMockStepReport(),
        ],
      });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('3 steps');
    });

    it('should show token usage when enabled', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false, showUsage: true });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('Tokens: 150');
      expect(output).toContain('in: 100');
      expect(output).toContain('out: 50');
    });

    it('should show captured entities when enabled', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false, showCaptured: true });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        captured: { myTask: { id: 'task-1', title: 'Test' } },
      });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('Captured: myTask');
    });

    it('should show error for failed scenarios in compact mode', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        status: 'failed',
        error: 'Assertion failed: expected status to be completed',
      });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('Error: Assertion failed');
    });

    it('should show raw diagnostics paths for failed scenarios', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        status: 'failed',
        rawDiagnostics: {
          dirPath: '/tmp/diag-123',
          files: ['metadata.json', 'response.txt'],
        },
      });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('Diagnostics: /tmp/diag-123');
      expect(output).toContain('metadata.json');
      expect(output).toContain('response.txt');
    });

    it('should show legacy diagnostics when showDiagnostics enabled', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false, showDiagnostics: true });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({
        status: 'failed',
        diagnostics: [{
          title: 'Tmux Logs',
          content: 'Error in line 5: undefined variable',
        }],
      });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('Diagnostics:');
      expect(output).toContain('Tmux Logs');
      expect(output).toContain('undefined variable');
    });
  });

  // =============================================================================
  // onSuiteComplete Tests
  // =============================================================================

  describe('onSuiteComplete', () => {
    it('should print summary header', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const report = createMockSuiteReport();

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).toContain('Summary:');
    });

    it('should print passed count', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const report = createMockSuiteReport({ passed: 5 });

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).toContain('5 passed');
    });

    it('should print failed count when non-zero', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const report = createMockSuiteReport({ failed: 2 });

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).toContain('2 failed');
    });

    it('should print skipped count when non-zero', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const report = createMockSuiteReport({ skipped: 3 });

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).toContain('3 skipped');
    });

    it('should print error count when non-zero', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const report = createMockSuiteReport({ errors: 1 });

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).toContain('1 errors');
    });

    it('should not print failed when zero', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const report = createMockSuiteReport({ failed: 0 });

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).not.toContain('0 failed');
    });

    it('should print total scenarios and duration', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const report = createMockSuiteReport({ total: 10, durationMs: 5000 });

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).toContain('Total: 10 scenarios');
      expect(output).toContain('5000ms');
    });

    it('should print token usage when enabled', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false, showUsage: true });
      const report = createMockSuiteReport({
        usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      reporter.onSuiteComplete(report);

      const output = getOutput();
      expect(output).toContain('Tokens: 1,500');
    });
  });

  // =============================================================================
  // finalize Tests
  // =============================================================================

  describe('finalize', () => {
    it('should be callable without error', () => {
      const reporter = new ConsoleReporter();

      expect(() => reporter.finalize()).not.toThrow();
    });
  });

  // =============================================================================
  // Color Tests
  // =============================================================================

  describe('colors', () => {
    it('should include ANSI codes when colors enabled', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: true });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      // Check for ANSI escape codes
      expect(output).toMatch(/\x1b\[/);
    });

    it('should not include ANSI codes when colors disabled', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      // Check there are no ANSI escape codes
      expect(output).not.toMatch(/\x1b\[/);
    });

    it('should use green for passed status', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: true });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('\x1b[32m'); // Green color code
    });

    it('should use red for failed status', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: true });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'failed' });

      reporter.onScenarioComplete(scenario, report);

      const output = getOutput();
      expect(output).toContain('\x1b[31m'); // Red color code
    });
  });

  // =============================================================================
  // Status Symbols Tests
  // =============================================================================

  describe('status symbols', () => {
    it('should use checkmark for passed', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'passed' });

      reporter.onScenarioComplete(scenario, report);

      expect(getOutput()).toContain('✓');
    });

    it('should use X for failed', () => {
      const { stream, getOutput } = createMockStream();
      const reporter = new ConsoleReporter({ stream, colors: false });
      const scenario = createMockScenario();
      const report = createMockScenarioReport({ status: 'failed' });

      reporter.onScenarioComplete(scenario, report);

      expect(getOutput()).toContain('✗');
    });
  });
});

// =============================================================================
// createConsoleReporter Tests
// =============================================================================

describe('createConsoleReporter', () => {
  it('should create a ConsoleReporter instance', () => {
    const reporter = createConsoleReporter();
    expect(reporter).toBeInstanceOf(ConsoleReporter);
  });

  it('should pass options to constructor', () => {
    const { stream } = createMockStream();
    const reporter = createConsoleReporter({ stream, colors: false, verbose: true });
    expect(reporter).toBeInstanceOf(ConsoleReporter);
  });
});
