/**
 * Tests for configuration system
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { resolveEnvVar, resolveConfig, validateConfig, defineConfig } from '../config/index.js';
import type { AgentQAConfig } from '../config/types.js';

describe('Configuration', () => {
  describe('defineConfig', () => {
    it('should return the config unchanged', () => {
      const config: AgentQAConfig = {
        name: 'TestApp',
        agent: { baseUrl: 'http://localhost:4000', token: 'test-token' },
        database: {
          url: 'postgresql://localhost/test',
          entities: [{ table: {} as any, name: 'tasks' }],
        },
      };

      const result = defineConfig(config);

      expect(result).toBe(config);
    });
  });

  describe('resolveEnvVar', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return literal values unchanged', () => {
      expect(resolveEnvVar('http://localhost:4000')).toBe('http://localhost:4000');
    });

    it('should resolve $VAR syntax', () => {
      process.env.TEST_URL = 'http://example.com';
      expect(resolveEnvVar('$TEST_URL')).toBe('http://example.com');
    });

    it('should throw for missing env var', () => {
      expect(() => resolveEnvVar('$MISSING_VAR')).toThrow('MISSING_VAR is not set');
    });
  });

  describe('validateConfig', () => {
    const validConfig: AgentQAConfig = {
      name: 'TestApp',
      agent: { baseUrl: 'http://localhost:4000', token: 'test-token' },
      database: {
        url: 'postgresql://localhost/test',
        entities: [{ table: {} as any, name: 'tasks' }],
      },
    };

    it('should pass for valid config', () => {
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should throw for missing name', () => {
      const config = { ...validConfig, name: '' };
      expect(() => validateConfig(config)).toThrow('"name" is required');
    });

    it('should throw for missing agent', () => {
      const config = { ...validConfig, agent: undefined as any };
      expect(() => validateConfig(config)).toThrow('"agent" section is required');
    });

    it('should throw for missing agent.baseUrl', () => {
      const config = { ...validConfig, agent: { ...validConfig.agent, baseUrl: '' } };
      expect(() => validateConfig(config)).toThrow('"agent.baseUrl" is required');
    });

    it('should pass for missing database (database is optional)', () => {
      const config = { ...validConfig, database: undefined as any };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should throw for empty entities', () => {
      const config = { ...validConfig, database: { ...validConfig.database, entities: [] } };
      expect(() => validateConfig(config)).toThrow('"database.entities" must have at least one entity');
    });

    it('should throw for entity without name', () => {
      const config = {
        ...validConfig,
        database: {
          ...validConfig.database,
          entities: [{ table: {} as any, name: '' }],
        },
      };
      expect(() => validateConfig(config)).toThrow('Each entity must have a "name"');
    });
  });

  describe('resolveConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      process.env.TEST_BASE_URL = 'http://example.com';
      process.env.TEST_TOKEN = 'secret-token';
      process.env.TEST_DB_URL = 'postgresql://example.com/db';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should resolve env vars in agent config', () => {
      const config: AgentQAConfig = {
        name: 'TestApp',
        agent: { baseUrl: '$TEST_BASE_URL', token: '$TEST_TOKEN' },
        database: {
          url: '$TEST_DB_URL',
          entities: [{ table: {} as any, name: 'tasks' }],
        },
      };

      const resolved = resolveConfig(config);

      expect(resolved.agent.baseUrl).toBe('http://example.com');
      expect(resolved.agent.token).toBe('secret-token');
      expect(resolved.database.url).toBe('postgresql://example.com/db');
    });

    it('should apply defaults', () => {
      const config: AgentQAConfig = {
        name: 'TestApp',
        agent: { baseUrl: 'http://localhost', token: 'token' },
        database: {
          url: 'postgresql://localhost/test',
          entities: [{ table: {} as any, name: 'tasks' }],
        },
      };

      const resolved = resolveConfig(config);

      expect(resolved.agent.chatEndpoint).toBe('/v1/chat');
      expect(resolved.agent.timeout).toBe(60000);
      expect(resolved.defaultUserId).toBe('test-user');
      expect(resolved.verbose).toBe(false);
      expect(resolved.stopOnFailure).toBe(false);
      expect(resolved.reporters).toEqual(['console']);
    });
  });
});
