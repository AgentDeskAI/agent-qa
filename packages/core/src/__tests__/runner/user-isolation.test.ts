/**
 * Tests for User Isolation
 */
import { describe, it, expect } from 'vitest';

import {
  AGENTQA_USER_PREFIX,
  AGENTQA_USER_PATTERN,
  generateScenarioUserId,
  generateLegacyScenarioUserId,
  isAgentQaUserId,
  isAgentQaEmail,
  extractScenarioSlug,
  generateCreateUserSql,
  generateDeleteUserSql,
  createUserIsolationContext,
  UserIsolationManager,
  createUserIsolationManager,
} from '../../runner/user-isolation.js';

describe('constants', () => {
  it('should have expected prefix', () => {
    expect(AGENTQA_USER_PREFIX).toBe('agentqa');
  });

  it('should have valid pattern', () => {
    expect(AGENTQA_USER_PATTERN.test('agentqa-test001-a1b2c3d4')).toBe(true);
    expect(AGENTQA_USER_PATTERN.test('agentqa-abc-12345678')).toBe(true);
    expect(AGENTQA_USER_PATTERN.test('invalid')).toBe(false);
  });
});

describe('generateScenarioUserId', () => {
  const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

  it('should generate a valid UUID format', () => {
    const userId = generateScenarioUserId({ scenarioId: 'test-001-basic' });

    expect(userId).toMatch(UUID_PATTERN);
  });

  it('should use seed for reproducibility', () => {
    const userId1 = generateScenarioUserId({ scenarioId: 'test', seed: 'abcd1234' });
    const userId2 = generateScenarioUserId({ scenarioId: 'test', seed: 'abcd1234' });

    expect(userId1).toBe(userId2);
    expect(userId1).toMatch(UUID_PATTERN);
  });

  it('should generate different IDs without seed', () => {
    const userId1 = generateScenarioUserId({ scenarioId: 'test' });
    const userId2 = generateScenarioUserId({ scenarioId: 'test' });

    // UUIDs should be different (highly likely)
    expect(userId1).not.toBe(userId2);
  });

  it('should handle empty scenario ID', () => {
    const userId = generateScenarioUserId({ scenarioId: '' });

    expect(userId).toMatch(UUID_PATTERN);
  });

  it('should generate different UUIDs for different scenarios', () => {
    const userId1 = generateScenarioUserId({ scenarioId: 'test-001', seed: 'same' });
    const userId2 = generateScenarioUserId({ scenarioId: 'test-002', seed: 'same' });

    expect(userId1).not.toBe(userId2);
  });
});

describe('generateLegacyScenarioUserId', () => {
  it('should generate ID with correct format', () => {
    const userId = generateLegacyScenarioUserId({ scenarioId: 'test-001-basic' });

    expect(userId).toMatch(/^agentqa-test001basic-[a-f0-9]{8}$/);
  });

  it('should sanitize special characters', () => {
    const userId = generateLegacyScenarioUserId({ scenarioId: 'Test-001_Special!@#$%' });

    expect(userId).toMatch(/^agentqa-test001special-[a-f0-9]{8}$/);
  });

  it('should truncate long scenario IDs', () => {
    const longId = 'a'.repeat(100);
    const userId = generateLegacyScenarioUserId({ scenarioId: longId });

    // Slug should be max 20 characters
    expect(userId.split('-')[1].length).toBeLessThanOrEqual(20);
  });

  it('should use seed for reproducibility', () => {
    const userId1 = generateLegacyScenarioUserId({ scenarioId: 'test', seed: 'abcd1234' });
    const userId2 = generateLegacyScenarioUserId({ scenarioId: 'test', seed: 'abcd1234' });

    expect(userId1).toBe(userId2);
    expect(userId1).toBe('agentqa-test-abcd1234');
  });

  it('should convert to lowercase', () => {
    const userId = generateLegacyScenarioUserId({ scenarioId: 'TEST-ABC', seed: '12345678' });

    expect(userId).toBe('agentqa-testabc-12345678');
  });
});

describe('isAgentQaUserId', () => {
  it('should return true for valid AgentQA user IDs', () => {
    expect(isAgentQaUserId('agentqa-test-12345678')).toBe(true);
    expect(isAgentQaUserId('agentqa-abc-def12345')).toBe(true);
    expect(isAgentQaUserId('agentqa-')).toBe(true); // Prefix only
  });

  it('should return false for non-AgentQA user IDs', () => {
    expect(isAgentQaUserId('user-12345')).toBe(false);
    expect(isAgentQaUserId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(false);
    expect(isAgentQaUserId('agentqa')).toBe(false); // No dash
    expect(isAgentQaUserId('')).toBe(false);
  });
});

describe('extractScenarioSlug', () => {
  it('should extract slug from valid ID', () => {
    expect(extractScenarioSlug('agentqa-test001-12345678')).toBe('test001');
    expect(extractScenarioSlug('agentqa-my-scenario-abcd1234')).toBe('my-scenario');
  });

  it('should return null for invalid ID', () => {
    expect(extractScenarioSlug('user-12345')).toBeNull();
    expect(extractScenarioSlug('agentqa')).toBeNull();
    expect(extractScenarioSlug('')).toBeNull();
  });

  it('should handle IDs with multiple dashes', () => {
    expect(extractScenarioSlug('agentqa-test-001-basic-12345678')).toBe('test-001-basic');
  });
});

describe('generateCreateUserSql', () => {
  it('should generate valid INSERT statement', () => {
    const sql = generateCreateUserSql({
      userId: 'agentqa-test-12345678',
    });

    expect(sql).toContain('INSERT INTO users');
    expect(sql).toContain("'agentqa-test-12345678'");
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
  });

  it('should use provided clerk user ID', () => {
    const sql = generateCreateUserSql({
      userId: 'agentqa-test-12345678',
      clerkUserId: 'user_custom123',
    });

    expect(sql).toContain("'user_custom123'");
  });

  it('should use provided email', () => {
    const sql = generateCreateUserSql({
      userId: 'agentqa-test-12345678',
      email: 'test@example.com',
    });

    expect(sql).toContain("'test@example.com'");
  });

  it('should escape single quotes', () => {
    const sql = generateCreateUserSql({
      userId: "test'user",
      displayName: "O'Brien",
    });

    expect(sql).toContain("test''user");
    expect(sql).toContain("O''Brien");
  });
});

describe('generateDeleteUserSql', () => {
  it('should generate DELETE statements', () => {
    const sql = generateDeleteUserSql('agentqa-test-12345678');

    expect(sql).toContain('DELETE FROM');
    expect(sql).toContain("'agentqa-test-12345678'");
  });

  it('should include all expected tables', () => {
    const sql = generateDeleteUserSql('test-user');

    expect(sql).toContain('DELETE FROM tasks');
    expect(sql).toContain('DELETE FROM reminders');
    expect(sql).toContain('DELETE FROM conversations');
    expect(sql).toContain('DELETE FROM users');
  });

  it('should escape single quotes', () => {
    const sql = generateDeleteUserSql("user'test");

    expect(sql).toContain("user''test");
  });
});

describe('isAgentQaEmail', () => {
  it('should return true for agentqa.local emails', () => {
    expect(isAgentQaEmail('test@agentqa.local')).toBe(true);
    expect(isAgentQaEmail('user-123@agentqa.local')).toBe(true);
  });

  it('should return false for other emails', () => {
    expect(isAgentQaEmail('test@example.com')).toBe(false);
    expect(isAgentQaEmail('user@agentqa.com')).toBe(false);
    expect(isAgentQaEmail('')).toBe(false);
  });
});

describe('createUserIsolationContext', () => {
  const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

  it('should create context with generated user ID', () => {
    const context = createUserIsolationContext('test-scenario');

    expect(context.scenarioId).toBe('test-scenario');
    expect(context.userId).toMatch(UUID_PATTERN);
    expect(context.created).toBe(false);
  });

  it('should use seed for reproducibility', () => {
    const context1 = createUserIsolationContext('test', 'abcd1234');
    const context2 = createUserIsolationContext('test', 'abcd1234');

    expect(context1.userId).toBe(context2.userId);
  });
});

describe('UserIsolationManager', () => {
  const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

  describe('when enabled', () => {
    it('should generate unique user IDs in UUID format', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: true,
      });

      const userId1 = manager.getUserId('scenario-1');
      const userId2 = manager.getUserId('scenario-2');

      expect(userId1).toMatch(UUID_PATTERN);
      expect(userId2).toMatch(UUID_PATTERN);
      expect(userId1).not.toBe(userId2);
    });

    it('should return same ID for same scenario', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: true,
      });

      const userId1 = manager.getUserId('scenario-1');
      const userId2 = manager.getUserId('scenario-1');

      expect(userId1).toBe(userId2);
    });

    it('should track contexts', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: true,
      });

      manager.getUserId('scenario-1');
      const context = manager.getContext('scenario-1');

      expect(context).toBeDefined();
      expect(context?.scenarioId).toBe('scenario-1');
    });

    it('should mark contexts as created', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: true,
      });

      manager.getUserId('scenario-1');
      manager.markCreated('scenario-1');

      const created = manager.getCreatedContexts();
      expect(created).toHaveLength(1);
      expect(created[0].scenarioId).toBe('scenario-1');
    });

    it('should clear all contexts', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: true,
      });

      manager.getUserId('scenario-1');
      manager.getUserId('scenario-2');
      manager.clear();

      expect(manager.getContext('scenario-1')).toBeUndefined();
      expect(manager.getContext('scenario-2')).toBeUndefined();
    });
  });

  describe('when disabled', () => {
    it('should return default user ID', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: false,
      });

      const userId = manager.getUserId('scenario-1');

      expect(userId).toBe('default-user');
    });

    it('should return same default for all scenarios', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: false,
      });

      const userId1 = manager.getUserId('scenario-1');
      const userId2 = manager.getUserId('scenario-2');

      expect(userId1).toBe('default-user');
      expect(userId2).toBe('default-user');
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: true,
      });

      expect(manager.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
        enabled: false,
      });

      expect(manager.isEnabled()).toBe(false);
    });

    it('should default to enabled', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'default-user',
      });

      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe('getDefaultUserId', () => {
    it('should return the default user ID', () => {
      const manager = new UserIsolationManager({
        defaultUserId: 'my-default-user',
      });

      expect(manager.getDefaultUserId()).toBe('my-default-user');
    });
  });
});

describe('createUserIsolationManager', () => {
  it('should create manager with options', () => {
    const manager = createUserIsolationManager({
      defaultUserId: 'test-user',
      enabled: true,
    });

    expect(manager.getDefaultUserId()).toBe('test-user');
    expect(manager.isEnabled()).toBe(true);
  });
});
