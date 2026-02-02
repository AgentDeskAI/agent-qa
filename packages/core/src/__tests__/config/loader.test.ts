/**
 * Config Loader Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  findConfigFile,
  loadConfigFile,
  loadConfig,
  hasConfigFile,
  getConfigDir,
} from '../../config/loader.js';

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// Mock the resolver module
vi.mock('../../config/resolver.js', () => ({
  resolveConfig: vi.fn((config) => ({ ...config, resolved: true })),
  validateConfig: vi.fn(),
}));

// =============================================================================
// findConfigFile Tests
// =============================================================================

describe('findConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find agentqa.config.ts in current directory', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith('agentqa.config.ts');
    });

    const result = findConfigFile('/project');

    expect(result).toBe('/project/agentqa.config.ts');
  });

  it('should find agentqa.config.js when ts not present', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith('agentqa.config.js');
    });

    const result = findConfigFile('/project');

    expect(result).toBe('/project/agentqa.config.js');
  });

  it('should find agentqa.config.mjs', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith('agentqa.config.mjs');
    });

    const result = findConfigFile('/project');

    expect(result).toBe('/project/agentqa.config.mjs');
  });

  it('should find legacy agent-qa.config.ts', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith('agent-qa.config.ts');
    });

    const result = findConfigFile('/project');

    expect(result).toBe('/project/agent-qa.config.ts');
  });

  it('should prioritize agentqa.config.ts over legacy names', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('agentqa.config.ts') || p.endsWith('agent-qa.config.ts');
    });

    const result = findConfigFile('/project');

    expect(result).toBe('/project/agentqa.config.ts');
  });

  it('should search parent directories', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      // Only exists in parent
      return path === '/project/agentqa.config.ts';
    });

    const result = findConfigFile('/project/src/test');

    expect(result).toBe('/project/agentqa.config.ts');
  });

  it('should return null when config not found', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(false);

    const result = findConfigFile('/project');

    expect(result).toBeNull();
  });

  it('should use process.cwd() when no startDir provided', () => {
    const mockExistsSync = vi.mocked(existsSync);
    const cwd = process.cwd();
    mockExistsSync.mockImplementation((path) => {
      return path === join(cwd, 'agentqa.config.ts');
    });

    const result = findConfigFile();

    expect(result).toBe(join(cwd, 'agentqa.config.ts'));
  });
});

// =============================================================================
// loadConfigFile Tests
// =============================================================================

describe('loadConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw when file does not exist', async () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(false);

    await expect(loadConfigFile('/not/exists.ts')).rejects.toThrow('Config file not found');
  });

  // Note: Testing actual dynamic import behavior requires integration tests
  // as vi.mock cannot easily mock dynamic imports with pathToFileURL
});

// =============================================================================
// loadConfig Tests
// =============================================================================

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw when no config file found', async () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(false);

    await expect(loadConfig()).rejects.toThrow('No agentqa.config.ts found');
  });

  it('should throw with helpful message about --config', async () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(false);

    try {
      await loadConfig();
    } catch (error) {
      expect((error as Error).message).toContain('--config');
    }
  });
});

// =============================================================================
// hasConfigFile Tests
// =============================================================================

describe('hasConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when config exists', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      return String(path).endsWith('agentqa.config.ts');
    });

    const result = hasConfigFile('/project');

    expect(result).toBe(true);
  });

  it('should return false when config not found', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(false);

    const result = hasConfigFile('/project');

    expect(result).toBe(false);
  });

  it('should use process.cwd() when no startDir provided', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(false);

    hasConfigFile();

    // Should have been called with paths starting from cwd
    expect(mockExistsSync).toHaveBeenCalled();
  });
});

// =============================================================================
// getConfigDir Tests
// =============================================================================

describe('getConfigDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return directory containing config', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      return path === '/project/agentqa.config.ts';
    });

    const result = getConfigDir('/project/src');

    expect(result).toBe('/project');
  });

  it('should return null when no config found', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockReturnValue(false);

    const result = getConfigDir('/project');

    expect(result).toBeNull();
  });

  it('should handle nested directory structures', () => {
    const mockExistsSync = vi.mocked(existsSync);
    mockExistsSync.mockImplementation((path) => {
      return path === '/root/project/agentqa.config.ts';
    });

    const result = getConfigDir('/root/project/src/deep/nested');

    expect(result).toBe('/root/project');
  });

  it('should use process.cwd() when no startDir provided', () => {
    const mockExistsSync = vi.mocked(existsSync);
    const cwd = process.cwd();
    mockExistsSync.mockImplementation((path) => {
      return path === join(cwd, 'agentqa.config.ts');
    });

    const result = getConfigDir();

    expect(result).toBe(cwd);
  });
});

// =============================================================================
// CONFIG_FILE_NAMES priority Tests
// =============================================================================

describe('config file name priority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check .ts before .js', () => {
    const mockExistsSync = vi.mocked(existsSync);
    const checkedPaths: string[] = [];

    mockExistsSync.mockImplementation((path) => {
      checkedPaths.push(String(path));
      return String(path).endsWith('agentqa.config.js');
    });

    findConfigFile('/project');

    // .ts should be checked before .js
    const tsIndex = checkedPaths.findIndex(p => p.endsWith('agentqa.config.ts'));
    const jsIndex = checkedPaths.findIndex(p => p.endsWith('agentqa.config.js'));

    expect(tsIndex).toBeLessThan(jsIndex);
  });

  it('should check new names before legacy names', () => {
    const mockExistsSync = vi.mocked(existsSync);
    const checkedPaths: string[] = [];

    mockExistsSync.mockImplementation((path) => {
      checkedPaths.push(String(path));
      return String(path).endsWith('agent-qa.config.ts');
    });

    findConfigFile('/project');

    // agentqa.config.ts should be checked before agent-qa.config.ts
    const newIndex = checkedPaths.findIndex(p => p.includes('agentqa.config.ts'));
    const legacyIndex = checkedPaths.findIndex(p => p.includes('agent-qa.config.ts'));

    expect(newIndex).toBeLessThan(legacyIndex);
  });
});
