/**
 * Tmux Log Provider Tests
 *
 * Tests for capturing logs from tmux sessions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
  createTmuxLogProvider,
  clearTmuxBuffer,
  captureTmuxLogs,
  hasTmuxSession,
  parseUsageReport,
} from '../../diagnostics/tmux-logs.js';
import type { FailureContext } from '../../diagnostics/types.js';

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createMockFailureContext(overrides: Partial<FailureContext> = {}): FailureContext {
  return {
    stepIndex: 0,
    stepType: 'chat',
    scenarioId: 'test-scenario',
    error: 'Test error',
    startTime: new Date('2025-01-15T10:00:00Z'),
    endTime: new Date('2025-01-15T10:01:00Z'),
    ...overrides,
  };
}

// =============================================================================
// createTmuxLogProvider Tests
// =============================================================================

describe('createTmuxLogProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('provider properties', () => {
    it('should create provider with session name in name', () => {
      const provider = createTmuxLogProvider({ sessionName: 'my-api' });

      expect(provider.name).toBe('tmux-logs:my-api');
    });

    it('should have collect method', () => {
      const provider = createTmuxLogProvider({ sessionName: 'api' });

      expect(typeof provider.collect).toBe('function');
    });
  });

  describe('collect', () => {
    it('should return null when session does not exist', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('session not found');
      });
      const provider = createTmuxLogProvider({ sessionName: 'nonexistent' });
      const context = createMockFailureContext();

      const result = await provider.collect(context);

      expect(result).toBeNull();
    });

    it('should return logs when session exists', async () => {
      // First call for has-session, second for capture-pane
      vi.mocked(execSync)
        .mockImplementationOnce(() => '') // has-session succeeds
        .mockImplementationOnce(() => '') // has-session check in captureLogs
        .mockImplementationOnce(() => 'Error: Connection refused\nStack trace'); // capture-pane

      const provider = createTmuxLogProvider({ sessionName: 'api' });
      const context = createMockFailureContext();

      const result = await provider.collect(context);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('logs');
      expect(result?.title).toContain('api');
    });

    it('should return null when capture returns empty', async () => {
      vi.mocked(execSync)
        .mockImplementationOnce(() => '') // has-session
        .mockImplementationOnce(() => '') // has-session in captureLogs
        .mockImplementationOnce(() => ''); // capture-pane returns empty

      const provider = createTmuxLogProvider({ sessionName: 'api' });
      const context = createMockFailureContext();

      const result = await provider.collect(context);

      expect(result).toBeNull();
    });

    it('should include raw data with session name and lines', async () => {
      const logContent = '2025-01-15T10:00:30Z Error: Something failed';
      vi.mocked(execSync)
        .mockImplementationOnce(() => '') // has-session
        .mockImplementationOnce(() => '') // has-session in captureLogs
        .mockImplementationOnce(() => logContent); // capture-pane

      const provider = createTmuxLogProvider({ sessionName: 'my-api' });
      const context = createMockFailureContext();

      const result = await provider.collect(context);

      expect(result?.raw).toHaveProperty('sessionName', 'my-api');
      expect(result?.raw).toHaveProperty('lines');
      expect(result?.raw).toHaveProperty('capturedAt');
    });

    it('should use custom line count', async () => {
      vi.mocked(execSync)
        .mockImplementationOnce(() => '') // has-session
        .mockImplementationOnce(() => '') // has-session in captureLogs
        .mockImplementationOnce(() => 'log line'); // capture-pane

      const provider = createTmuxLogProvider({ sessionName: 'api', lines: 500 });
      const context = createMockFailureContext();

      await provider.collect(context);

      // Verify capture-pane was called with correct line count
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('-S -500'),
        expect.anything()
      );
    });
  });
});

// =============================================================================
// hasTmuxSession Tests
// =============================================================================

describe('hasTmuxSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when session exists', () => {
    vi.mocked(execSync).mockReturnValue('');

    const result = hasTmuxSession('my-session');

    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('has-session'),
      expect.anything()
    );
  });

  it('should return false when session does not exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('session not found');
    });

    const result = hasTmuxSession('nonexistent');

    expect(result).toBe(false);
  });
});

// =============================================================================
// captureTmuxLogs Tests
// =============================================================================

describe('captureTmuxLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return log content when session exists', () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => '') // has-session
      .mockImplementationOnce(() => 'Line 1\nLine 2\nLine 3');

    const result = captureTmuxLogs('my-session');

    expect(result).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should return error message when session does not exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('session not found');
    });

    const result = captureTmuxLogs('nonexistent');

    expect(result).toBe('(No tmux session found)');
  });

  it('should use default line count of 100', () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => '') // has-session
      .mockImplementationOnce(() => 'logs');

    captureTmuxLogs('my-session');

    expect(execSync).toHaveBeenLastCalledWith(
      expect.stringContaining('-S -100'),
      expect.anything()
    );
  });

  it('should use custom line count', () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => '') // has-session
      .mockImplementationOnce(() => 'logs');

    captureTmuxLogs('my-session', 250);

    expect(execSync).toHaveBeenLastCalledWith(
      expect.stringContaining('-S -250'),
      expect.anything()
    );
  });
});

// =============================================================================
// clearTmuxBuffer Tests
// =============================================================================

describe('clearTmuxBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call clear-history when session exists', () => {
    vi.mocked(execSync).mockReturnValue('');

    clearTmuxBuffer('my-session');

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('clear-history'),
      expect.anything()
    );
  });

  it('should not throw when session does not exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('session not found');
    });

    expect(() => clearTmuxBuffer('nonexistent')).not.toThrow();
  });

  it('should not throw when clear-history fails', () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => '') // has-session
      .mockImplementationOnce(() => {
        throw new Error('clear failed');
      });

    expect(() => clearTmuxBuffer('my-session')).not.toThrow();
  });
});

// =============================================================================
// parseUsageReport Tests
// =============================================================================

describe('parseUsageReport', () => {
  it('should return null when no Usage Report found', () => {
    const logs = 'Some random log content\nNo usage report here';

    const result = parseUsageReport(logs);

    expect(result).toBeNull();
  });

  it('should parse basic Usage Report header', () => {
    const logs = `
# Usage Report

- Session: session-123
- Correlation: corr-456
- User Input: "Create a task"
- Provider: anthropic
- Model: claude-3
- Duration: 1500ms
- Steps: 3

## Token Usage
- Input: 1,000
- Output: 500
- Total: 1,500
- Calls: 2

## Cost Estimate
- Input: $0.01
- Output: $0.02
- Total: $0.03
`;

    const result = parseUsageReport(logs);

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('session-123');
    expect(result?.correlationId).toBe('corr-456');
    expect(result?.userInput).toBe('Create a task');
    expect(result?.provider).toBe('anthropic');
    expect(result?.model).toBe('claude-3');
    expect(result?.duration).toBe(1500);
    expect(result?.steps).toBe(3);
  });

  it('should parse token totals', () => {
    const logs = `
# Usage Report

## Token Usage
- Input: 10,000
- Output: 5,000
- Total: 15,000
- Calls: 5
`;

    const result = parseUsageReport(logs);

    expect(result?.totals.input).toBe(10000);
    expect(result?.totals.output).toBe(5000);
    expect(result?.totals.total).toBe(15000);
    expect(result?.totals.calls).toBe(5);
  });

  it('should parse cost estimate', () => {
    const logs = `
# Usage Report

## Cost Estimate
- Input: $0.10
- Output: $0.25
- Total: $0.35
`;

    const result = parseUsageReport(logs);

    expect(result?.cost.input).toBe('$0.10');
    expect(result?.cost.output).toBe('$0.25');
    expect(result?.cost.total).toBe('$0.35');
  });

  it('should parse per-agent usage', () => {
    const logs = `
# Usage Report

## Per-Agent Total Usage

**router (anthropic/claude-3)**: 5,000 tokens (50.0%) [3 calls] — $0.05
  - Input: 3,000
  - Output: 2,000

**executor (anthropic/claude-3)**: 5,000 tokens (50.0%) [2 calls] — $0.05
  - Input: 3,000
  - Output: 2,000
`;

    const result = parseUsageReport(logs);

    expect(result?.agents).toHaveLength(2);
    expect(result?.agents[0].name).toBe('router');
    expect(result?.agents[0].tokens).toBe(5000);
    expect(result?.agents[0].percentage).toBe(50.0);
    expect(result?.agents[0].calls).toBe(3);
    expect(result?.agents[0].cost).toBe('$0.05');
  });

  it('should parse step-by-step analysis', () => {
    const logs = `
# Usage Report

## Step-by-Step Analysis

- **router** step 1: 1,000 in / 500 out — ~$0.01 [10:30:00.123]
  - system: 500
  - user: 500
- **executor** step 2: 2,000 in / 1,000 out (+reused) — ~$0.02 [10:30:01.456]
`;

    const result = parseUsageReport(logs);

    expect(result?.stepAnalysis).toHaveLength(2);
    expect(result?.stepAnalysis[0].agent).toBe('router');
    expect(result?.stepAnalysis[0].stepNumber).toBe(1);
    expect(result?.stepAnalysis[0].inputTokens).toBe(1000);
    expect(result?.stepAnalysis[0].outputTokens).toBe(500);
    expect(result?.stepAnalysis[0].cost).toBe('$0.01');
    expect(result?.stepAnalysis[0].timestamp).toBe('10:30:00.123');
  });

  it('should parse provider vs internal usage delta', () => {
    const logs = `
# Usage Report

## Provider vs Internal Usage Totals
- Internal: 10,000 input / 5,000 output
- Provider: 10,500 input / 5,200 output
- Delta: +500 input / +200 output (4.5%)
`;

    const result = parseUsageReport(logs);

    expect(result?.trackingDelta).toBeDefined();
    expect(result?.trackingDelta?.internal.input).toBe(10000);
    expect(result?.trackingDelta?.internal.output).toBe(5000);
    expect(result?.trackingDelta?.provider.input).toBe(10500);
    expect(result?.trackingDelta?.provider.output).toBe(5200);
    expect(result?.trackingDelta?.delta.input).toBe(500);
    expect(result?.trackingDelta?.delta.output).toBe(200);
    expect(result?.trackingDelta?.percent).toBe(4.5);
  });

  it('should handle missing optional fields gracefully', () => {
    const logs = `
# Usage Report

## Token Usage
- Input: 100
- Output: 50
- Total: 150
`;

    const result = parseUsageReport(logs);

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBeUndefined();
    expect(result?.correlationId).toBeUndefined();
    expect(result?.agents).toEqual([]);
    expect(result?.stepAnalysis).toEqual([]);
    expect(result?.trackingDelta).toBeUndefined();
  });

  it('should handle numbers with commas', () => {
    const logs = `
# Usage Report

## Token Usage
- Input: 1,234,567
- Output: 987,654
- Total: 2,222,221
- Calls: 100
`;

    const result = parseUsageReport(logs);

    expect(result?.totals.input).toBe(1234567);
    expect(result?.totals.output).toBe(987654);
    expect(result?.totals.total).toBe(2222221);
  });
});
