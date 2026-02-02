/**
 * Relationship Assertions Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseRelationship,
  assertRelationship,
  extractRelationships,
  validateRelationships,
  defaultRelationshipPatterns,
  type ParsedRelationship,
} from '../../assertions/relationship.js';
import type { RelationshipPattern } from '../../config/types.js';
import type { EntityRow } from '../../assertions/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const testPatterns: RelationshipPattern[] = [
  {
    name: 'belongs_to_list',
    pattern: /(.+)\s+belongs to list\s+(.+)/i,
    subjectEntity: 'tasks',
    objectEntity: 'lists',
    foreignKey: 'listId',
  },
  {
    name: 'subtask_of',
    pattern: /(.+)\s+is a subtask of\s+(.+)/i,
    subjectEntity: 'tasks',
    objectEntity: 'tasks',
    foreignKey: 'parentId',
  },
  {
    name: 'reminder_for',
    pattern: /(.+)\s+is a reminder for\s+(.+)/i,
    subjectEntity: 'reminders',
    objectEntity: 'tasks',
    foreignKey: 'taskId',
    subjectLookupField: 'text',
    objectLookupField: 'title',
  },
];

function createEntity(overrides: Partial<EntityRow> = {}): EntityRow {
  return {
    id: 'entity-1',
    title: 'Test Entity',
    ...overrides,
  };
}

// =============================================================================
// parseRelationship Tests
// =============================================================================

describe('parseRelationship', () => {
  it('should parse "belongs to list" pattern', () => {
    const result = parseRelationship('Task A belongs to list My List', testPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('belongs_to_list');
    expect(result!.subject).toBe('Task A');
    expect(result!.object).toBe('My List');
    expect(result!.subjectEntity).toBe('tasks');
    expect(result!.objectEntity).toBe('lists');
    expect(result!.foreignKey).toBe('listId');
  });

  it('should parse "is a subtask of" pattern', () => {
    const result = parseRelationship('Child Task is a subtask of Parent Task', testPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('subtask_of');
    expect(result!.subject).toBe('Child Task');
    expect(result!.object).toBe('Parent Task');
    expect(result!.subjectEntity).toBe('tasks');
    expect(result!.objectEntity).toBe('tasks');
    expect(result!.foreignKey).toBe('parentId');
  });

  it('should parse custom patterns with lookup fields', () => {
    const result = parseRelationship('Meeting reminder is a reminder for Meeting Task', testPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('reminder_for');
    expect(result!.subjectLookupField).toBe('text');
    expect(result!.objectLookupField).toBe('title');
  });

  it('should return null for unmatched input', () => {
    const result = parseRelationship('Some random text that matches nothing', testPatterns);

    expect(result).toBeNull();
  });

  it('should handle case insensitivity', () => {
    const result = parseRelationship('Task A BELONGS TO LIST My List', testPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('belongs_to_list');
  });

  it('should trim whitespace from subject and object', () => {
    const result = parseRelationship('  Task A   belongs to list   My List  ', testPatterns);

    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Task A');
    expect(result!.object).toBe('My List');
  });

  it('should return null when no patterns provided', () => {
    const result = parseRelationship('Task A belongs to list My List', []);

    expect(result).toBeNull();
  });

  it('should use first matching pattern', () => {
    const duplicatePatterns: RelationshipPattern[] = [
      {
        name: 'first_pattern',
        pattern: /(.+)\s+test\s+(.+)/i,
        subjectEntity: 'first',
        objectEntity: 'first',
        foreignKey: 'firstKey',
      },
      {
        name: 'second_pattern',
        pattern: /(.+)\s+test\s+(.+)/i,
        subjectEntity: 'second',
        objectEntity: 'second',
        foreignKey: 'secondKey',
      },
    ];

    const result = parseRelationship('A test B', duplicatePatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('first_pattern');
  });
});

// =============================================================================
// assertRelationship Tests
// =============================================================================

describe('assertRelationship', () => {
  it('should pass when relationship exists', async () => {
    const parsed: ParsedRelationship = {
      patternName: 'belongs_to_list',
      subject: 'My Task',
      object: 'My List',
      subjectEntity: 'tasks',
      objectEntity: 'lists',
      foreignKey: 'listId',
    };

    const getEntity = vi.fn().mockImplementation((type: string, titleOrId: string) => {
      if (type === 'tasks' && titleOrId === 'My Task') {
        return Promise.resolve(createEntity({ id: 'task-1', title: 'My Task', listId: 'list-1' }));
      }
      if (type === 'lists' && titleOrId === 'My List') {
        return Promise.resolve(createEntity({ id: 'list-1', title: 'My List' }));
      }
      return Promise.resolve(null);
    });

    const result = await assertRelationship(parsed, getEntity);

    expect(result.passed).toBe(true);
    expect(result.message).toContain('belongs_to_list');
    expect(result.message).toContain('My Task');
    expect(result.message).toContain('My List');
  });

  it('should fail when subject entity not found', async () => {
    const parsed: ParsedRelationship = {
      patternName: 'belongs_to_list',
      subject: 'Missing Task',
      object: 'My List',
      subjectEntity: 'tasks',
      objectEntity: 'lists',
      foreignKey: 'listId',
    };

    const getEntity = vi.fn().mockResolvedValue(null);

    const result = await assertRelationship(parsed, getEntity);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Subject entity not found');
    expect(result.message).toContain('Missing Task');
  });

  it('should fail when object entity not found', async () => {
    const parsed: ParsedRelationship = {
      patternName: 'belongs_to_list',
      subject: 'My Task',
      object: 'Missing List',
      subjectEntity: 'tasks',
      objectEntity: 'lists',
      foreignKey: 'listId',
    };

    const getEntity = vi.fn().mockImplementation((type: string) => {
      if (type === 'tasks') {
        return Promise.resolve(createEntity({ id: 'task-1', listId: 'list-1' }));
      }
      return Promise.resolve(null);
    });

    const result = await assertRelationship(parsed, getEntity);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Object entity not found');
    expect(result.message).toContain('Missing List');
  });

  it('should fail when foreign key does not match', async () => {
    const parsed: ParsedRelationship = {
      patternName: 'belongs_to_list',
      subject: 'My Task',
      object: 'My List',
      subjectEntity: 'tasks',
      objectEntity: 'lists',
      foreignKey: 'listId',
    };

    const getEntity = vi.fn().mockImplementation((type: string, titleOrId: string) => {
      if (type === 'tasks' && titleOrId === 'My Task') {
        // Task has wrong listId
        return Promise.resolve(createEntity({ id: 'task-1', title: 'My Task', listId: 'other-list' }));
      }
      if (type === 'lists' && titleOrId === 'My List') {
        return Promise.resolve(createEntity({ id: 'list-1', title: 'My List' }));
      }
      return Promise.resolve(null);
    });

    const result = await assertRelationship(parsed, getEntity);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Relationship');
    expect(result.message).toContain('failed');
    expect(result.expected).toBe('list-1');
    expect(result.actual).toBe('other-list');
  });

  it('should pass lookup field to getEntity', async () => {
    const parsed: ParsedRelationship = {
      patternName: 'reminder_for',
      subject: 'My Reminder',
      object: 'My Task',
      subjectEntity: 'reminders',
      objectEntity: 'tasks',
      foreignKey: 'taskId',
      subjectLookupField: 'text',
      objectLookupField: 'title',
    };

    const getEntity = vi.fn().mockImplementation((type: string, titleOrId: string) => {
      if (type === 'reminders') {
        return Promise.resolve(createEntity({ id: 'reminder-1', text: 'My Reminder', taskId: 'task-1' }));
      }
      if (type === 'tasks') {
        return Promise.resolve(createEntity({ id: 'task-1', title: 'My Task' }));
      }
      return Promise.resolve(null);
    });

    await assertRelationship(parsed, getEntity);

    expect(getEntity).toHaveBeenCalledWith('reminders', 'My Reminder', 'text');
    expect(getEntity).toHaveBeenCalledWith('tasks', 'My Task', 'title');
  });

  it('should handle null foreign key value', async () => {
    const parsed: ParsedRelationship = {
      patternName: 'belongs_to_list',
      subject: 'My Task',
      object: 'My List',
      subjectEntity: 'tasks',
      objectEntity: 'lists',
      foreignKey: 'listId',
    };

    const getEntity = vi.fn().mockImplementation((type: string) => {
      if (type === 'tasks') {
        return Promise.resolve(createEntity({ id: 'task-1', listId: null }));
      }
      if (type === 'lists') {
        return Promise.resolve(createEntity({ id: 'list-1' }));
      }
      return Promise.resolve(null);
    });

    const result = await assertRelationship(parsed, getEntity);

    expect(result.passed).toBe(false);
    expect(result.actual).toBeNull();
  });
});

// =============================================================================
// extractRelationships Tests
// =============================================================================

describe('extractRelationships', () => {
  it('should extract single relationship from text', () => {
    const text = 'Task A belongs to list My List.';
    const result = extractRelationships(text, testPatterns);

    expect(result).toHaveLength(1);
    expect(result[0].patternName).toBe('belongs_to_list');
    expect(result[0].subject).toBe('Task A');
    expect(result[0].object).toBe('My List');
  });

  it('should extract multiple relationships from text', () => {
    const text = 'Task A belongs to list My List. Child Task is a subtask of Parent Task.';
    const result = extractRelationships(text, testPatterns);

    expect(result).toHaveLength(2);
    expect(result[0].patternName).toBe('belongs_to_list');
    expect(result[1].patternName).toBe('subtask_of');
  });

  it('should return empty array when no matches', () => {
    const text = 'This is just some random text without any relationships.';
    const result = extractRelationships(text, testPatterns);

    expect(result).toHaveLength(0);
  });

  it('should split on sentence boundaries', () => {
    const text = 'Task A belongs to list List 1! Task B belongs to list List 2?';
    const result = extractRelationships(text, testPatterns);

    expect(result).toHaveLength(2);
  });

  it('should handle empty text', () => {
    const result = extractRelationships('', testPatterns);

    expect(result).toHaveLength(0);
  });

  it('should handle text with no sentence boundaries', () => {
    const text = 'Task A belongs to list My List';
    const result = extractRelationships(text, testPatterns);

    // Should still extract from single "sentence"
    expect(result).toHaveLength(1);
  });

  it('should skip empty sentences', () => {
    const text = '   . . Task A belongs to list My List. . .';
    const result = extractRelationships(text, testPatterns);

    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// validateRelationships Tests
// =============================================================================

describe('validateRelationships', () => {
  it('should validate all extracted relationships', async () => {
    const text = 'Task A belongs to list My List. Task B is a subtask of Task A.';

    const getEntity = vi.fn().mockImplementation((type: string, titleOrId: string) => {
      const entities: Record<string, EntityRow> = {
        'tasks:Task A': createEntity({ id: 'task-a', title: 'Task A', listId: 'list-1', parentId: null }),
        'tasks:Task B': createEntity({ id: 'task-b', title: 'Task B', parentId: 'task-a' }),
        'lists:My List': createEntity({ id: 'list-1', title: 'My List' }),
      };
      return Promise.resolve(entities[`${type}:${titleOrId}`] ?? null);
    });

    const results = await validateRelationships(text, testPatterns, getEntity);

    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(true);
  });

  it('should return results in order', async () => {
    const text = 'Task A belongs to list My List. Task B is a subtask of Task A.';

    const getEntity = vi.fn().mockImplementation((type: string, titleOrId: string) => {
      const entities: Record<string, EntityRow> = {
        'tasks:Task A': createEntity({ id: 'task-a', title: 'Task A', listId: 'list-1' }),
        'tasks:Task B': createEntity({ id: 'task-b', title: 'Task B', parentId: 'task-a' }),
        'lists:My List': createEntity({ id: 'list-1', title: 'My List' }),
      };
      return Promise.resolve(entities[`${type}:${titleOrId}`] ?? null);
    });

    const results = await validateRelationships(text, testPatterns, getEntity);

    expect(results[0].message).toContain('belongs_to_list');
    expect(results[1].message).toContain('subtask_of');
  });

  it('should return empty array when no relationships found', async () => {
    const text = 'Just some random text.';
    const getEntity = vi.fn();

    const results = await validateRelationships(text, testPatterns, getEntity);

    expect(results).toHaveLength(0);
    expect(getEntity).not.toHaveBeenCalled();
  });

  it('should include failed relationships in results', async () => {
    const text = 'Task A belongs to list Missing List.';

    const getEntity = vi.fn().mockImplementation((type: string) => {
      if (type === 'tasks') {
        return Promise.resolve(createEntity({ id: 'task-a', listId: 'list-1' }));
      }
      return Promise.resolve(null); // List not found
    });

    const results = await validateRelationships(text, testPatterns, getEntity);

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });
});

// =============================================================================
// defaultRelationshipPatterns Tests
// =============================================================================

describe('defaultRelationshipPatterns', () => {
  it('should match "is a subtask of" pattern', () => {
    const result = parseRelationship('Child is a subtask of Parent', defaultRelationshipPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('subtask_of');
    expect(result!.foreignKey).toBe('parentId');
  });

  it('should match "is a child of" pattern', () => {
    const result = parseRelationship('Child is a child of Parent', defaultRelationshipPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('child_of');
    expect(result!.foreignKey).toBe('parentId');
  });

  it('should match "belongs to" pattern', () => {
    const result = parseRelationship('Task belongs to List', defaultRelationshipPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('belongs_to');
    expect(result!.foreignKey).toBe('parentId');
  });

  it('should match "is part of" pattern', () => {
    const result = parseRelationship('Task is part of Project', defaultRelationshipPatterns);

    expect(result).not.toBeNull();
    expect(result!.patternName).toBe('part_of');
    expect(result!.foreignKey).toBe('parentId');
  });

  it('should have all patterns configured for tasks entity', () => {
    for (const pattern of defaultRelationshipPatterns) {
      expect(pattern.subjectEntity).toBe('tasks');
      expect(pattern.objectEntity).toBe('tasks');
    }
  });
});
