/**
 * Tests for scenario parsing functionality
 */
import { describe, it, expect } from 'vitest';

import { parseScenario, isChatStep, isVerifyStep } from '../scenario/index.js';

describe('Scenario Parsing', () => {
  it('should parse a simple scenario', () => {
    const yaml = `
id: test-001
name: Test Scenario
tags:
  - smoke
steps:
  - chat: "Hello world"
    label: greeting
`;

    const scenario = parseScenario(yaml);

    expect(scenario.id).toBe('test-001');
    expect(scenario.name).toBe('Test Scenario');
    expect(scenario.tags).toEqual(['smoke']);
    expect(scenario.steps).toHaveLength(1);
  });

  it('should parse chat steps with tools assertion', () => {
    const yaml = `
id: test-002
steps:
  - chat: "Create a task"
    tools:
      manageTasks: 1
`;

    const scenario = parseScenario(yaml);
    const step = scenario.steps[0];

    expect(isChatStep(step)).toBe(true);
    if (isChatStep(step)) {
      expect(step.chat).toBe('Create a task');
      expect(step.tools).toEqual({ manageTasks: 1 });
    }
  });

  it('should parse verify steps', () => {
    const yaml = `
id: test-003
steps:
  - verify:
      tasks:
        - title: "Test Task"
          fields:
            status: active
`;

    const scenario = parseScenario(yaml);
    const step = scenario.steps[0];

    expect(isVerifyStep(step)).toBe(true);
    if (isVerifyStep(step)) {
      expect(step.verify.tasks).toBeDefined();
    }
  });

  it('should parse response assertions', () => {
    const yaml = `
id: test-004
steps:
  - chat: "Hello"
    response:
      contains:
        - greeting
      mentions:
        - user
`;

    const scenario = parseScenario(yaml);
    const step = scenario.steps[0];

    if (isChatStep(step)) {
      expect(step.response?.contains).toEqual(['greeting']);
      expect(step.response?.mentions).toEqual(['user']);
    }
  });

  it('should parse created assertions', () => {
    const yaml = `
id: test-005
steps:
  - chat: "Create a task"
    created:
      - entity: tasks
        as: newTask
        fields:
          title: "New Task"
`;

    const scenario = parseScenario(yaml);
    const step = scenario.steps[0];

    if (isChatStep(step)) {
      expect(step.created).toHaveLength(1);
      expect(step.created![0].entity).toBe('tasks');
      expect(step.created![0].as).toBe('newTask');
      expect(step.created![0].fields?.title).toBe('New Task');
    }
  });

  it('should parse setup steps', () => {
    const yaml = `
id: test-006
setup:
  - insert: user
    as: testUser
    email: test@example.com
  - insert: reminder
    userId: $testUser
    text: "Test reminder"
    scheduledFor: "2025-01-01T10:00:00Z"
    as: testReminder
steps:
  - chat: "Show my reminders"
`;

    const scenario = parseScenario(yaml);

    expect(scenario.setup).toHaveLength(2);
    expect(scenario.steps).toHaveLength(1);
  });
});
