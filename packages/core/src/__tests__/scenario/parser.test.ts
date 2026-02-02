/**
 * Additional Scenario Parser Tests
 *
 * Tests for error handling and edge cases in scenario parsing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

import {
  parseScenario,
  parseScenarioFile,
  parseScenarioFiles,
  ParseError,
} from '../../scenario/parser.js';
import { isChatStep, isVerifyStep, isWaitStep, isInlineSetupStep } from '../../scenario/index.js';

// =============================================================================
// Mock fs module
// =============================================================================

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

// =============================================================================
// Tests
// =============================================================================

describe('Scenario Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // ParseError class
  // ===========================================================================

  describe('ParseError', () => {
    it('should create error without source', () => {
      const error = new ParseError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.source).toBeUndefined();
      expect(error.name).toBe('ParseError');
    });

    it('should create error with source file', () => {
      const error = new ParseError('Test error', { file: 'test.yaml' });
      expect(error.message).toBe('Test error at test.yaml:?');
      expect(error.source).toEqual({ file: 'test.yaml' });
    });

    it('should create error with source file and line', () => {
      const error = new ParseError('Test error', { file: 'test.yaml', line: 10 });
      expect(error.message).toBe('Test error at test.yaml:10');
    });
  });

  // ===========================================================================
  // parseScenarioFile
  // ===========================================================================

  describe('parseScenarioFile', () => {
    it('should read and parse file successfully', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
`;
      vi.mocked(fs.readFileSync).mockReturnValue(yaml);

      const scenario = parseScenarioFile('/path/to/test.yaml');

      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/test.yaml', 'utf-8');
      expect(scenario.id).toBe('test-001');
    });

    it('should throw ParseError on file read error', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => parseScenarioFile('/missing/file.yaml')).toThrow(ParseError);
      expect(() => parseScenarioFile('/missing/file.yaml')).toThrow(
        /Failed to read scenario file/
      );
    });

    it('should re-throw ParseError from parsing', () => {
      const invalidYaml = `
id: test-001
steps: not-an-array
`;
      vi.mocked(fs.readFileSync).mockReturnValue(invalidYaml);

      expect(() => parseScenarioFile('/path/to/test.yaml')).toThrow(ParseError);
    });

    it('should handle non-Error throws during file read', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'String error';
      });

      expect(() => parseScenarioFile('/path/to/test.yaml')).toThrow(
        /Failed to read scenario file: String error/
      );
    });
  });

  // ===========================================================================
  // parseScenarioFiles
  // ===========================================================================

  describe('parseScenarioFiles', () => {
    it('should parse multiple files', () => {
      const yaml1 = `id: test-001\nsteps:\n  - chat: "Hello"`;
      const yaml2 = `id: test-002\nsteps:\n  - chat: "World"`;

      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(yaml1)
        .mockReturnValueOnce(yaml2);

      const scenarios = parseScenarioFiles(['/path/file1.yaml', '/path/file2.yaml']);

      expect(scenarios).toHaveLength(2);
      expect(scenarios[0].id).toBe('test-001');
      expect(scenarios[1].id).toBe('test-002');
    });

    it('should return empty array for empty input', () => {
      const scenarios = parseScenarioFiles([]);
      expect(scenarios).toEqual([]);
    });
  });

  // ===========================================================================
  // parseScenario - YAML errors
  // ===========================================================================

  describe('parseScenario - YAML errors', () => {
    it('should throw on invalid YAML syntax', () => {
      const invalidYaml = `
id: test
  invalid: indentation
wrong: [unclosed
`;

      expect(() => parseScenario(invalidYaml)).toThrow(ParseError);
      expect(() => parseScenario(invalidYaml)).toThrow(/Invalid YAML/);
    });

    it('should throw when scenario is not an object', () => {
      expect(() => parseScenario('just a string')).toThrow(
        /Scenario must be an object/
      );
    });

    it('should throw when scenario is null', () => {
      expect(() => parseScenario('null')).toThrow(/Scenario must be an object/);
    });

    it('should throw when missing id and name', () => {
      const yaml = `
steps:
  - chat: "Hello"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /Scenario must have an "id" or "name" field/
      );
    });

    it('should use name as id when id is missing', () => {
      const yaml = `
name: My Scenario
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      expect(scenario.id).toBe('My Scenario');
    });
  });

  // ===========================================================================
  // parseScenario - steps errors
  // ===========================================================================

  describe('parseScenario - steps errors', () => {
    it('should throw when steps is missing', () => {
      const yaml = `
id: test-001
`;

      expect(() => parseScenario(yaml)).toThrow(/must have "steps" array/);
    });

    it('should throw when steps is not an array', () => {
      const yaml = `
id: test-001
steps: "not an array"
`;

      expect(() => parseScenario(yaml)).toThrow(/"steps" must be an array/);
    });

    it('should throw when step is not an object', () => {
      const yaml = `
id: test-001
steps:
  - "just a string"
`;

      expect(() => parseScenario(yaml)).toThrow(/Step 0 must be an object/);
    });

    it('should throw when step has unknown type', () => {
      const yaml = `
id: test-001
steps:
  - unknown_type: "value"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /must have "chat", "verify", "wait", "setup", or "verifyVectors" field/
      );
    });
  });

  // ===========================================================================
  // Chat step parsing
  // ===========================================================================

  describe('Chat step parsing', () => {
    it('should throw when chat is not a string', () => {
      const yaml = `
id: test-001
steps:
  - chat:
      message: "object instead of string"
`;

      expect(() => parseScenario(yaml)).toThrow(/"chat" must be a string/);
    });

    it('should parse all chat step options', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    label: greeting
    continueConversation: true
    conversationId: conv-123
    maxToolCalls: 5
    timeout: 30
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      expect(isChatStep(step)).toBe(true);
      if (isChatStep(step)) {
        expect(step.chat).toBe('Hello');
        expect(step.label).toBe('greeting');
        expect(step.continueConversation).toBe(true);
        expect(step.conversationId).toBe('conv-123');
        expect(step.maxToolCalls).toBe(5);
        expect(step.timeout).toBe(30);
      }
    });

    it('should parse conversation field', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    conversation: conv1
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      expect(isChatStep(step)).toBe(true);
      if (isChatStep(step)) {
        expect(step.conversation).toBe('conv1');
      }
    });

    it('should parse conversation field with no value as undefined', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      expect(isChatStep(step)).toBe(true);
      if (isChatStep(step)) {
        expect(step.conversation).toBeUndefined();
      }
    });

    it('should parse conversation field alongside other options', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create a task"
    conversation: myConversation
    maxToolCalls: 5
    tools:
      manageTasks: 1
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isChatStep(step)) {
        expect(step.conversation).toBe('myConversation');
        expect(step.maxToolCalls).toBe(5);
        expect(step.tools).toEqual({ manageTasks: 1 });
      }
    });

    it('should parse totalToolCalls as number', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    totalToolCalls: 3
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isChatStep(step)) {
        expect(step.totalToolCalls).toBe(3);
      }
    });

    it('should parse totalToolCalls as min/max object', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    totalToolCalls:
      min: 1
      max: 5
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isChatStep(step)) {
        expect(step.totalToolCalls).toEqual({ min: 1, max: 5 });
      }
    });

    it('should throw on invalid totalToolCalls.min', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    totalToolCalls:
      min: "not a number"
`;

      expect(() => parseScenario(yaml)).toThrow(/totalToolCalls.min must be a number/);
    });

    it('should throw on invalid totalToolCalls.max', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    totalToolCalls:
      max: "not a number"
`;

      expect(() => parseScenario(yaml)).toThrow(/totalToolCalls.max must be a number/);
    });

    it('should throw on invalid totalToolCalls type', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    totalToolCalls: "invalid"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /totalToolCalls must be a number or { min\?, max\? }/
      );
    });
  });

  // ===========================================================================
  // Tool assertions parsing
  // ===========================================================================

  describe('Tool assertions parsing', () => {
    it('should parse tool assertions as array format', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    tools:
      - name: createTask
        count: 1
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isChatStep(step)) {
        expect(Array.isArray(step.tools)).toBe(true);
        expect((step.tools as Array<{ name: string }>)[0].name).toBe('createTask');
      }
    });

    it('should throw on array tool assertion without name', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    tools:
      - count: 1
`;

      expect(() => parseScenario(yaml)).toThrow(/tools\[0\].name must be a string/);
    });

    it('should throw on array tool assertion that is not object', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    tools:
      - "not an object"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /tools\[0\] must be an object with tool assertion properties/
      );
    });

    it('should parse simple tool assertion format', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    tools:
      createTask: 1
      updateTask:
        min: 0
        max: 2
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isChatStep(step)) {
        expect(step.tools).toEqual({
          createTask: 1,
          updateTask: { min: 0, max: 2 },
        });
      }
    });

    it('should throw on invalid simple tool assertion value', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    tools:
      createTask: "not valid"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /tools.createTask must be a number or { min\?, max\? }/
      );
    });
  });

  // ===========================================================================
  // Created assertions parsing
  // ===========================================================================

  describe('Created assertions parsing', () => {
    it('should throw when created is not an array', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    created: "not an array"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /"created" must be an array of entity assertions/
      );
    });

    it('should throw when created item is not an object', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    created:
      - "not an object"
`;

      expect(() => parseScenario(yaml)).toThrow(/created\[0\] must be an object/);
    });

    it('should throw when created item missing entity', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Create task"
    created:
      - fields:
          title: "Task"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /created\[0\].entity must be a string/
      );
    });
  });

  // ===========================================================================
  // Response assertions parsing
  // ===========================================================================

  describe('Response assertions parsing', () => {
    it('should throw when response is not an object', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    response: "not an object"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /"response" must be an object with assertion properties/
      );
    });

    it('should parse response with all assertion types', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
    response:
      contains:
        - greeting
      notContains:
        - error
      mentions:
        - user
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isChatStep(step)) {
        expect(step.response?.contains).toEqual(['greeting']);
        expect(step.response?.notContains).toEqual(['error']);
        expect(step.response?.mentions).toEqual(['user']);
      }
    });
  });

  // ===========================================================================
  // Verify step parsing
  // ===========================================================================

  describe('Verify step parsing', () => {
    it('should throw when verify is not an object', () => {
      const yaml = `
id: test-001
steps:
  - verify: "not an object"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /verify step must have verification object/
      );
    });

    it('should throw when verify entity is not an array', () => {
      const yaml = `
id: test-001
steps:
  - verify:
      tasks: "not an array"
`;

      expect(() => parseScenario(yaml)).toThrow(/verify.tasks must be an array/);
    });

    it('should throw when verify entity item is not an object', () => {
      const yaml = `
id: test-001
steps:
  - verify:
      tasks:
        - "not an object"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /verify.tasks\[0\] must be an object/
      );
    });

    it('should parse verify with multiple entities', () => {
      const yaml = `
id: test-001
steps:
  - verify:
      tasks:
        - title: "Task 1"
        - title: "Task 2"
      reminders:
        - text: "Reminder"
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      expect(isVerifyStep(step)).toBe(true);
      if (isVerifyStep(step)) {
        expect(step.verify.tasks).toHaveLength(2);
        expect(step.verify.reminders).toHaveLength(1);
      }
    });
  });

  // ===========================================================================
  // Wait step parsing
  // ===========================================================================

  describe('Wait step parsing', () => {
    it('should throw when wait is not an object', () => {
      const yaml = `
id: test-001
steps:
  - wait: "not an object"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /wait step must have condition object/
      );
    });

    it('should throw when wait missing entity', () => {
      const yaml = `
id: test-001
steps:
  - wait:
      where:
        status: active
`;

      expect(() => parseScenario(yaml)).toThrow(
        /wait must have "seconds" or "entity".*"for_entity" property/
      );
    });

    it('should parse wait with entity property', () => {
      const yaml = `
id: test-001
steps:
  - wait:
      entity: tasks
      where:
        status: active
    timeoutSeconds: 30
    intervalSeconds: 2
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      expect(isWaitStep(step)).toBe(true);
      if (isWaitStep(step)) {
        expect(step.wait.entity).toBe('tasks');
        expect(step.timeoutSeconds).toBe(30);
        expect(step.intervalSeconds).toBe(2);
      }
    });

    it('should parse wait with for_entity property', () => {
      const yaml = `
id: test-001
steps:
  - wait:
      for_entity: reminders
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isWaitStep(step)) {
        expect(step.wait.for_entity).toBe('reminders');
      }
    });
  });

  // ===========================================================================
  // Inline setup step parsing
  // ===========================================================================

  describe('Inline setup step parsing', () => {
    it('should parse inline setup steps', () => {
      const yaml = `
id: test-001
steps:
  - setup:
      - entity: tasks
        data:
          title: "Test Task"
        as: testTask
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      expect(isInlineSetupStep(step)).toBe(true);
      if (isInlineSetupStep(step)) {
        expect(step.setup).toHaveLength(1);
        expect(step.setup[0].entity).toBe('tasks');
        expect(step.setup[0].data).toEqual({ title: 'Test Task' });
        expect(step.setup[0].as).toBe('testTask');
      }
    });

    it('should throw when inline setup item is not an object', () => {
      const yaml = `
id: test-001
steps:
  - setup:
      - "not an object"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /Step 0: setup\[0\] must be an object/
      );
    });

    it('should throw when inline setup missing entity', () => {
      const yaml = `
id: test-001
steps:
  - setup:
      - data:
          title: "Task"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /Step 0: setup\[0\].entity must be a string/
      );
    });

    it('should throw when inline setup missing data', () => {
      const yaml = `
id: test-001
steps:
  - setup:
      - entity: tasks
`;

      expect(() => parseScenario(yaml)).toThrow(
        /Step 0: setup\[0\].data must be an object/
      );
    });

    it('should handle inline setup without as alias', () => {
      const yaml = `
id: test-001
steps:
  - setup:
      - entity: tasks
        data:
          title: "Task"
`;

      const scenario = parseScenario(yaml);
      const step = scenario.steps[0];

      if (isInlineSetupStep(step)) {
        expect(step.setup[0].as).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // Scenario setup parsing
  // ===========================================================================

  describe('Scenario setup parsing', () => {
    it('should throw when setup is not an array', () => {
      const yaml = `
id: test-001
setup: "not an array"
steps:
  - chat: "Hello"
`;

      expect(() => parseScenario(yaml)).toThrow(/"setup" must be an array/);
    });

    it('should throw when setup step is not an object', () => {
      const yaml = `
id: test-001
setup:
  - "not an object"
steps:
  - chat: "Hello"
`;

      expect(() => parseScenario(yaml)).toThrow(/Setup step 0 must be an object/);
    });

    it('should throw when setup step has unknown type', () => {
      const yaml = `
id: test-001
setup:
  - unknown_field: value
steps:
  - chat: "Hello"
`;

      expect(() => parseScenario(yaml)).toThrow(
        /Setup step 0 must have "insert" or "process" field/
      );
    });

    it('should parse insert setup step', () => {
      const yaml = `
id: test-001
setup:
  - insert: user
    email: test@example.com
    as: testUser
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);

      expect(scenario.setup).toHaveLength(1);
      expect(scenario.setup![0].insert).toBe('user');
    });

    it('should parse process setup step', () => {
      const yaml = `
id: test-001
setup:
  - process: reminder
    reminderId: $testReminder
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);

      expect(scenario.setup).toHaveLength(1);
      expect(scenario.setup![0].process).toBe('reminder');
    });
  });

  // ===========================================================================
  // Optional fields parsing
  // ===========================================================================

  describe('Optional fields parsing', () => {
    it('should parse description', () => {
      const yaml = `
id: test-001
description: "This is a test scenario"
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      expect(scenario.description).toBe('This is a test scenario');
    });

    it('should parse userId', () => {
      const yaml = `
id: test-001
userId: user-123
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      expect(scenario.userId).toBe('user-123');
    });

    it('should parse timeout', () => {
      const yaml = `
id: test-001
timeout: 60
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      expect(scenario.timeout).toBe(60);
    });

    it('should handle non-string values gracefully', () => {
      const yaml = `
id: test-001
description: 123
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      // Non-string description is ignored
      expect(scenario.description).toBeUndefined();
    });

    it('should filter non-string tags', () => {
      const yaml = `
id: test-001
tags:
  - smoke
  - 123
  - regression
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      expect(scenario.tags).toEqual(['smoke', 'regression']);
    });
  });

  // ===========================================================================
  // Source location tracking
  // ===========================================================================

  describe('Source location tracking', () => {
    it('should include file path in source', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(`
id: test-001
steps:
  - chat: "Hello"
`);

      const scenario = parseScenarioFile('/path/to/scenario.yaml');
      expect(scenario.source?.file).toBe('/path/to/scenario.yaml');
    });

    it('should use <inline> for content without file', () => {
      const yaml = `
id: test-001
steps:
  - chat: "Hello"
`;

      const scenario = parseScenario(yaml);
      expect(scenario.source?.file).toBe('<inline>');
    });
  });
});
