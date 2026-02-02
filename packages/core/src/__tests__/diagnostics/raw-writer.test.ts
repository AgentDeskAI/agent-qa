/**
 * Raw Diagnostics Writer Tests
 *
 * Tests for writing raw diagnostic data to files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  writeRawDiagnostics,
  createRawDiagnosticsWriter,
  appendTempoTraces,
  readFailureMetadata,
  type RawDiagnosticsData,
  type FailureMetadata,
} from '../../diagnostics/raw-writer.js';

// Mock node:fs
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createMockFailureMetadata(overrides: Partial<FailureMetadata> = {}): FailureMetadata {
  return {
    scenarioId: 'test-scenario',
    scenarioName: 'Test Scenario',
    failedStep: {
      index: 0,
      label: 'create-task',
      type: 'chat',
    },
    error: 'Assertion failed',
    timing: {
      scenarioStartTime: new Date().toISOString(),
      failureTime: new Date().toISOString(),
      totalDurationMs: 1000,
    },
    context: {
      userId: 'user-123',
      conversationId: 'conv-456',
      correlationIds: ['corr-789'],
    },
    ...overrides,
  };
}

function createMockDiagnosticsData(overrides: Partial<RawDiagnosticsData> = {}): RawDiagnosticsData {
  return {
    failure: createMockFailureMetadata(),
    ...overrides,
  };
}

// =============================================================================
// writeRawDiagnostics Tests
// =============================================================================

describe('writeRawDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create output directory', async () => {
    const data = createMockDiagnosticsData();

    await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('test-scenario'),
      { recursive: true }
    );
  });

  it('should write failure.json', async () => {
    const data = createMockDiagnosticsData();

    await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('failure.json'),
      expect.stringContaining('"scenarioId"')
    );
  });

  it('should return directory path and files list', async () => {
    const data = createMockDiagnosticsData();

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(result.dirPath).toContain('test-scenario');
    expect(result.files).toContain('failure.json');
  });

  it('should write http-responses.json when present', async () => {
    const data = createMockDiagnosticsData({
      httpResponses: [{
        stepIndex: 0,
        message: 'Create a task',
        response: 'Task created',
        durationMs: 100,
      }],
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('http-responses.json'),
      expect.stringContaining('"Create a task"')
    );
    expect(result.files).toContainEqual(expect.stringContaining('http-responses.json'));
  });

  it('should write tempo-traces.json when present', async () => {
    const data = createMockDiagnosticsData({
      tempoTraces: [{ traceId: 'trace-123', spans: [] }],
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('tempo-traces.json'),
      expect.stringContaining('"trace-123"')
    );
    expect(result.files).toContainEqual(expect.stringContaining('tempo-traces.json'));
  });

  it('should write tmux-logs.txt when present', async () => {
    const data = createMockDiagnosticsData({
      tmuxLogs: 'Error: Connection refused\nStack trace...',
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('tmux-logs.txt'),
      'Error: Connection refused\nStack trace...'
    );
    expect(result.files).toContain('tmux-logs.txt');
  });

  it('should not write http-responses.json when empty', async () => {
    const data = createMockDiagnosticsData({
      httpResponses: [],
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(result.files).not.toContainEqual(expect.stringContaining('http-responses'));
  });

  it('should not write tempo-traces.json when empty', async () => {
    const data = createMockDiagnosticsData({
      tempoTraces: [],
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(result.files).not.toContainEqual(expect.stringContaining('tempo-traces'));
  });

  it('should not write tmux-logs.txt when empty or whitespace', async () => {
    const data = createMockDiagnosticsData({
      tmuxLogs: '   \n  \n  ',
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(result.files).not.toContain('tmux-logs.txt');
  });

  it('should include response count in file list', async () => {
    const data = createMockDiagnosticsData({
      httpResponses: [
        { stepIndex: 0, message: 'Step 1', durationMs: 100 },
        { stepIndex: 1, message: 'Step 2', durationMs: 200 },
      ],
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(result.files).toContainEqual(expect.stringContaining('2 responses'));
  });

  it('should include trace count in file list', async () => {
    const data = createMockDiagnosticsData({
      tempoTraces: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const result = await writeRawDiagnostics('/output', 'test-scenario', data);

    expect(result.files).toContainEqual(expect.stringContaining('3 traces'));
  });
});

// =============================================================================
// createRawDiagnosticsWriter Tests
// =============================================================================

describe('createRawDiagnosticsWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a writer with write method', () => {
    const writer = createRawDiagnosticsWriter('/output');

    expect(writer).toHaveProperty('write');
    expect(typeof writer.write).toBe('function');
  });

  it('should write to configured output directory', async () => {
    const writer = createRawDiagnosticsWriter('/my-output-dir');
    const data = createMockDiagnosticsData();

    await writer.write('test-scenario', data);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('my-output-dir'),
      { recursive: true }
    );
  });
});

// =============================================================================
// appendTempoTraces Tests
// =============================================================================

describe('appendTempoTraces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should write traces to tempo-traces.json', () => {
    const traces = [{ traceId: 'trace-1' }, { traceId: 'trace-2' }];

    const result = appendTempoTraces('/output/scenario/timestamp', traces);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('tempo-traces.json'),
      expect.stringContaining('"trace-1"')
    );
    expect(result).toContainEqual(expect.stringContaining('2 traces'));
  });

  it('should return empty array when traces is empty', () => {
    const result = appendTempoTraces('/output/scenario/timestamp', []);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('should return empty array when traces is undefined', () => {
    const result = appendTempoTraces('/output/scenario/timestamp', undefined as unknown as unknown[]);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

// =============================================================================
// readFailureMetadata Tests
// =============================================================================

describe('readFailureMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read and parse failure.json', () => {
    const mockMetadata = createMockFailureMetadata();
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockMetadata));

    const result = readFailureMetadata('/output/scenario/timestamp');

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('failure.json'),
      'utf-8'
    );
    expect(result).toEqual(mockMetadata);
  });

  it('should return null when file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const result = readFailureMetadata('/output/scenario/timestamp');

    expect(result).toBeNull();
  });

  it('should return null when file contains invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json');

    const result = readFailureMetadata('/output/scenario/timestamp');

    expect(result).toBeNull();
  });

  it('should extract correlationIds from metadata', () => {
    const mockMetadata = createMockFailureMetadata({
      context: {
        correlationIds: ['corr-1', 'corr-2', 'corr-3'],
      },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockMetadata));

    const result = readFailureMetadata('/output/scenario/timestamp');

    expect(result?.context.correlationIds).toEqual(['corr-1', 'corr-2', 'corr-3']);
  });
});
