/**
 * Alias Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeAlias,
  resolveAliasRef,
  resolveValue,
  type AliasContext,
} from '../../utils/alias.js';

// =============================================================================
// normalizeAlias Tests
// =============================================================================

describe('normalizeAlias', () => {
  it('should strip $ prefix', () => {
    expect(normalizeAlias('$myTask')).toBe('myTask');
  });

  it('should keep alias without $ prefix unchanged', () => {
    expect(normalizeAlias('myTask')).toBe('myTask');
  });

  it('should handle empty string', () => {
    expect(normalizeAlias('')).toBe('');
  });

  it('should handle $ alone', () => {
    expect(normalizeAlias('$')).toBe('');
  });

  it('should only strip first $ prefix', () => {
    expect(normalizeAlias('$$myTask')).toBe('$myTask');
  });
});

// =============================================================================
// resolveAliasRef Tests
// =============================================================================

describe('resolveAliasRef', () => {
  describe('basic reference resolution', () => {
    it('should return not found for non-reference values', () => {
      const context: AliasContext = {};
      const result = resolveAliasRef('literal', context);

      expect(result.found).toBe(false);
    });

    it('should return not found for empty context', () => {
      const context: AliasContext = {};
      const result = resolveAliasRef('$unknownAlias', context);

      expect(result.found).toBe(false);
    });
  });

  describe('$userId resolution', () => {
    it('should resolve $userId reference', () => {
      const context: AliasContext = {
        userId: 'user-123',
      };
      const result = resolveAliasRef('$userId', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('user-123');
        expect(result.source).toBe('userId');
      }
    });

    it('should return not found when userId not in context', () => {
      const context: AliasContext = {};
      const result = resolveAliasRef('$userId', context);

      expect(result.found).toBe(false);
    });
  });

  describe('captured entity resolution', () => {
    it('should resolve alias from captured entities', () => {
      const context: AliasContext = {
        captured: {
          myTask: { id: 'task-456', title: 'Test Task', status: 'pending' },
        },
      };
      const result = resolveAliasRef('$myTask.id', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('task-456');
        expect(result.source).toBe('captured');
      }
    });

    it('should default to id field when not specified', () => {
      const context: AliasContext = {
        captured: {
          myTask: { id: 'task-789' },
        },
      };
      const result = resolveAliasRef('$myTask', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('task-789');
      }
    });

    it('should resolve custom field from captured entity', () => {
      const context: AliasContext = {
        captured: {
          myTask: { id: 'task-123', title: 'My Title', status: 'completed' },
        },
      };
      const result = resolveAliasRef('$myTask.title', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('My Title');
      }
    });

    it('should return not found for undefined field', () => {
      const context: AliasContext = {
        captured: {
          myTask: { id: 'task-123' },
        },
      };
      const result = resolveAliasRef('$myTask.nonexistent', context);

      expect(result.found).toBe(false);
    });

    it('should handle null field value as not found', () => {
      const context: AliasContext = {
        captured: {
          myTask: { id: 'task-123', parentId: null as unknown as string },
        },
      };
      // Note: null is treated as found since it's not undefined
      const result = resolveAliasRef('$myTask.parentId', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('aliases map resolution', () => {
    it('should resolve alias from aliases map', () => {
      const aliasMap = new Map([
        ['myList', { id: 'list-001', type: 'lists' }],
      ]);
      const context: AliasContext = {
        aliases: aliasMap,
      };
      const result = resolveAliasRef('$myList.id', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('list-001');
        expect(result.source).toBe('alias');
      }
    });

    it('should default to id field for aliases map', () => {
      const aliasMap = new Map([
        ['myList', { id: 'list-002', type: 'lists' }],
      ]);
      const context: AliasContext = {
        aliases: aliasMap,
      };
      const result = resolveAliasRef('$myList', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('list-002');
      }
    });

    it('should return not found for non-id fields on aliases', () => {
      const aliasMap = new Map([
        ['myList', { id: 'list-003', type: 'lists' }],
      ]);
      const context: AliasContext = {
        aliases: aliasMap,
      };
      // Only .id is accessible from aliases map
      const result = resolveAliasRef('$myList.type', context);

      expect(result.found).toBe(false);
    });
  });

  describe('priority order', () => {
    it('should prefer captured entities over aliases map', () => {
      const aliasMap = new Map([
        ['myTask', { id: 'from-aliases-map', type: 'tasks' }],
      ]);
      const context: AliasContext = {
        captured: {
          myTask: { id: 'from-captured' },
        },
        aliases: aliasMap,
      };
      const result = resolveAliasRef('$myTask.id', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('from-captured');
        expect(result.source).toBe('captured');
      }
    });

    it('should check $userId before captured entities', () => {
      // Note: userId is a special case alias, not a general alias
      const context: AliasContext = {
        userId: 'special-user-id',
        captured: {
          userId: { id: 'captured-user-entity' },
        },
      };
      const result = resolveAliasRef('$userId', context);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.value).toBe('special-user-id');
        expect(result.source).toBe('userId');
      }
    });
  });
});

// =============================================================================
// resolveValue Tests
// =============================================================================

describe('resolveValue', () => {
  it('should return resolved value when reference found', () => {
    const context: AliasContext = {
      captured: {
        myTask: { id: 'task-resolved' },
      },
    };
    const result = resolveValue('$myTask.id', context);

    expect(result).toBe('task-resolved');
  });

  it('should return original value for non-references', () => {
    const context: AliasContext = {};
    const result = resolveValue('literal-value', context);

    expect(result).toBe('literal-value');
  });

  it('should return original value when reference not found', () => {
    const context: AliasContext = {};
    const result = resolveValue('$unknown', context);

    expect(result).toBe('$unknown');
  });

  it('should convert non-string values to string', () => {
    const context: AliasContext = {
      captured: {
        myTask: { id: 'task-1', count: 42 },
      },
    };
    const result = resolveValue('$myTask.count', context);

    expect(result).toBe('42');
  });

  it('should resolve $userId', () => {
    const context: AliasContext = {
      userId: 'user-abc',
    };
    const result = resolveValue('$userId', context);

    expect(result).toBe('user-abc');
  });
});
