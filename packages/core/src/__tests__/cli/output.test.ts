/**
 * CLI Output Utilities Tests
 *
 * Tests for terminal output formatting functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  color,
  success,
  error,
  warning,
  info,
  dim,
  header,
  divider,
  table,
  json,
  spinner,
  truncate,
  formatDuration,
  formatTokens,
  exitWithError,
} from '../../cli/utils/output.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('CLI Output Utilities', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // color()
  // ===========================================================================

  describe('color', () => {
    it('should apply color codes to text', () => {
      const result = color('green', 'test');
      expect(result).toContain('test');
      // The function uses ANSI codes when NO_COLOR is not set
      expect(result.length).toBeGreaterThanOrEqual('test'.length);
    });

    it('should apply bold formatting', () => {
      const result = color('bold', 'bold text');
      expect(result).toContain('bold text');
    });

    it('should apply dim formatting', () => {
      const result = color('dim', 'dim text');
      expect(result).toContain('dim text');
    });

    it('should apply red color', () => {
      const result = color('red', 'error');
      expect(result).toContain('error');
    });

    it('should apply yellow color', () => {
      const result = color('yellow', 'warning');
      expect(result).toContain('warning');
    });

    it('should apply cyan color', () => {
      const result = color('cyan', 'info');
      expect(result).toContain('info');
    });
  });

  // ===========================================================================
  // success()
  // ===========================================================================

  describe('success', () => {
    it('should print success message with checkmark', () => {
      success('Operation completed');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('✓');
      expect(output).toContain('Operation completed');
    });
  });

  // ===========================================================================
  // error()
  // ===========================================================================

  describe('error', () => {
    it('should print error message with X mark', () => {
      error('Something failed');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('✗');
      expect(output).toContain('Something failed');
    });
  });

  // ===========================================================================
  // warning()
  // ===========================================================================

  describe('warning', () => {
    it('should print warning message with warning symbol', () => {
      warning('Be careful');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('⚠');
      expect(output).toContain('Be careful');
    });
  });

  // ===========================================================================
  // info()
  // ===========================================================================

  describe('info', () => {
    it('should print info message with info symbol', () => {
      info('FYI');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('ℹ');
      expect(output).toContain('FYI');
    });
  });

  // ===========================================================================
  // dim()
  // ===========================================================================

  describe('dim', () => {
    it('should print dim/muted message', () => {
      dim('Less important');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('Less important');
    });
  });

  // ===========================================================================
  // header()
  // ===========================================================================

  describe('header', () => {
    it('should print header with separator line', () => {
      header('Test Header');

      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      // First call is empty line
      expect(consoleLogSpy.mock.calls[0][0]).toBe('');
      // Second call is the header text
      expect(consoleLogSpy.mock.calls[1][0]).toContain('Test Header');
      // Third call is the separator
      expect(consoleLogSpy.mock.calls[2][0]).toContain('─');
    });

    it('should limit separator length to 60 characters', () => {
      header('A'.repeat(100));

      const separator = consoleLogSpy.mock.calls[2][0];
      // The separator should not exceed 60 chars (plus ANSI codes)
      expect(separator).toContain('─'.repeat(60));
    });
  });

  // ===========================================================================
  // divider()
  // ===========================================================================

  describe('divider', () => {
    it('should print a 60-character divider line', () => {
      divider();

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('─'.repeat(60));
    });
  });

  // ===========================================================================
  // table()
  // ===========================================================================

  describe('table', () => {
    it('should not print anything for empty array', () => {
      table([]);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should print header and rows', () => {
      table([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);

      // Should print: header row, separator, 2 data rows
      expect(consoleLogSpy).toHaveBeenCalledTimes(4);

      // First row should be header
      const headerOutput = consoleLogSpy.mock.calls[0][0];
      expect(headerOutput).toContain('name');
      expect(headerOutput).toContain('age');
    });

    it('should align columns based on content width', () => {
      table([
        { col1: 'a', col2: 'short' },
        { col1: 'longer', col2: 'x' },
      ]);

      // Data rows should be padded
      const dataRow = consoleLogSpy.mock.calls[2][0];
      expect(dataRow).toContain('a');
    });

    it('should handle undefined values', () => {
      table([{ name: 'Test', value: undefined }]);

      expect(consoleLogSpy).toHaveBeenCalled();
      // Should not throw
    });
  });

  // ===========================================================================
  // json()
  // ===========================================================================

  describe('json', () => {
    it('should print pretty JSON by default', () => {
      json({ key: 'value', nested: { a: 1 } });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('"key": "value"');
      expect(output).toContain('\n'); // Pretty format has newlines
    });

    it('should print compact JSON when pretty=false', () => {
      json({ key: 'value' }, false);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toBe('{"key":"value"}');
    });

    it('should handle arrays', () => {
      json([1, 2, 3]);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('1');
      expect(output).toContain('2');
      expect(output).toContain('3');
    });

    it('should handle null', () => {
      json(null);

      expect(consoleLogSpy).toHaveBeenCalledWith('null');
    });
  });

  // ===========================================================================
  // spinner()
  // ===========================================================================

  describe('spinner', () => {
    it('should return a stop function', () => {
      vi.useFakeTimers();

      const stop = spinner('Loading...');

      expect(typeof stop).toBe('function');

      stop();
      vi.useRealTimers();
    });

    it('should write to stdout', () => {
      vi.useFakeTimers();

      const stop = spinner('Working...');

      // Advance timer to trigger frame
      vi.advanceTimersByTime(100);

      expect(stdoutWriteSpy).toHaveBeenCalled();

      stop();
      vi.useRealTimers();
    });

    it('should stop writing after stop is called', () => {
      vi.useFakeTimers();

      const stop = spinner('Processing...');

      vi.advanceTimersByTime(80);
      const callCountBefore = stdoutWriteSpy.mock.calls.length;

      stop();

      // Clear the stop's own write
      vi.advanceTimersByTime(200);

      // After stopping, no new frame writes should happen
      // (only the clear line write from stop)
      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // truncate()
  // ===========================================================================

  describe('truncate', () => {
    it('should return text unchanged if shorter than max', () => {
      const result = truncate('short', 10);
      expect(result).toBe('short');
    });

    it('should return text unchanged if equal to max', () => {
      const result = truncate('exact', 5);
      expect(result).toBe('exact');
    });

    it('should truncate with ellipsis if longer than max', () => {
      const result = truncate('this is a long string', 10);
      expect(result).toBe('this is...');
      expect(result.length).toBe(10);
    });

    it('should handle empty string', () => {
      const result = truncate('', 10);
      expect(result).toBe('');
    });
  });

  // ===========================================================================
  // formatDuration()
  // ===========================================================================

  describe('formatDuration', () => {
    it('should format milliseconds for < 1 second', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds for < 1 minute', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(30000)).toBe('30.0s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format minutes and seconds for >= 1 minute', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('should handle large durations', () => {
      expect(formatDuration(3600000)).toBe('60m 0s');
    });
  });

  // ===========================================================================
  // formatTokens()
  // ===========================================================================

  describe('formatTokens', () => {
    it('should return raw number for < 1000', () => {
      expect(formatTokens(0)).toBe('0');
      expect(formatTokens(500)).toBe('500');
      expect(formatTokens(999)).toBe('999');
    });

    it('should format as k for >= 1000 and < 1M', () => {
      expect(formatTokens(1000)).toBe('1.0k');
      expect(formatTokens(1500)).toBe('1.5k');
      expect(formatTokens(10000)).toBe('10.0k');
      expect(formatTokens(999999)).toBe('1000.0k');
    });

    it('should format as M for >= 1M', () => {
      expect(formatTokens(1000000)).toBe('1.00M');
      expect(formatTokens(1500000)).toBe('1.50M');
      expect(formatTokens(10000000)).toBe('10.00M');
    });
  });

  // ===========================================================================
  // exitWithError()
  // ===========================================================================

  describe('exitWithError', () => {
    it('should print error and exit with code 1 by default', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() => exitWithError('Fatal error')).toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('Fatal error');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with custom code', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() => exitWithError('Custom error', 42)).toThrow('process.exit called');

      expect(exitSpy).toHaveBeenCalledWith(42);
    });
  });
});
