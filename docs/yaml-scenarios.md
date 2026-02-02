# YAML Scenario Reference

Complete guide to writing test scenarios in YAML.

## Suite Structure

```yaml
# suite.yaml
name: My Test Suite
baseDir: ./scenarios    # Optional: base directory for scenario files
scenarios:
  - id: test-001
    name: First test
    steps:
      - chat: "Hello"
```

## Scenario Structure

```yaml
id: unique-scenario-id       # Required
name: Human readable name    # Optional
tags: [smoke, regression]    # Optional: for filtering
userId: custom-user-id       # Optional: override default
setup:                       # Optional: pre-test data
  - insert: tasks
    data:
      title: "Existing task"
      status: "todo"
    as: $existingTask
steps:
  - chat: "..."
```

## Step Types

### Chat Step

Send a message and assert on the response:

```yaml
- chat: "Create a task called 'Buy milk'"
  label: create-task           # Optional: for targeting
  tools:
    createTask: 1              # Expect tool called once
  response:
    contains: ["created", "task"]
  created:
    - entity: tasks
      fields:
        title: "Buy milk"
```

### Verify Step

Verify database state:

```yaml
- verify:
    entity: tasks
    filters:
      status: "completed"
    count: 3
```

### Wait Step

Wait for async conditions:

```yaml
- wait:
    entity: reminders
    id: $reminder.id
    until:
      status: "delivered"
    timeout: 30000
```

## Tool Assertions

Assert on tool calls made by the agent:

```yaml
tools:
  createTask: 1                # Exact count
  updateTask: { gte: 1 }       # At least 1
  deleteTask: 0                # Not called
  searchTasks:
    count: { gte: 1 }
    input:
      query: { contains: "grocery" }
```

### Total Tool Calls

```yaml
totalToolCalls: { lte: 5 }     # At most 5 total tool calls
```

## Entity Assertions

Verify entities were created:

```yaml
created:
  - entity: tasks
    as: $newTask               # Capture for later reference
    fields:
      title: "Buy milk"
      status: "todo"
      dueDate: { exists: true }
```

### Field Matchers

```yaml
fields:
  title: "Exact match"
  title: { contains: "milk" }
  title: { regex: "^Buy.*$" }
  count: { gt: 0 }
  count: { gte: 1, lt: 10 }
  dueDate: { exists: true }
  deletedAt: { exists: false }
  parentId: { ref: "$parentTask.id" }
```

## Response Assertions

```yaml
response:
  contains: ["created", "successfully"]
  notContains: ["error", "failed"]
  regex: "Task .* created"
```

## Usage Assertions

Assert on token consumption:

```yaml
usage:
  inputTokens: { gt: 0 }
  outputTokens: { gt: 0 }
  totalTokens: { lt: 50000 }
  callCount: { gte: 1 }
  cacheReadTokens: { gt: 0 }   # Validate caching

  # Compound assertions for non-deterministic behavior
  anyOf:
    - cacheCreationTokens: { gt: 0 }  # Cold cache
    - cacheReadTokens: { gt: 0 }       # Warm cache
```

## Message Processing Assertions

Assert on message preprocessing:

```yaml
messageProcessing:
  condenser:
    activated: true
    condensedMessages: { gte: 4 }
    summaryContains: ["task", "created"]
  pruner:
    activated: true
```

## Conversation Management

### Continue Conversation

```yaml
steps:
  - chat: "Create a task"
  - chat: "Now mark it complete"
    continueConversation: true   # Same conversation
```

### Named Conversations

```yaml
steps:
  - chat: "Start conversation A"
    conversation: conv-a

  - chat: "Start conversation B"
    conversation: conv-b

  - chat: "Continue A"
    conversation: conv-a         # Returns to conv-a
```

## Setup Data

Insert test data before steps run:

```yaml
setup:
  - insert: tasks
    data:
      title: "Existing task"
      status: "todo"
      priority: 1
    as: $existingTask

  - insert: reminders
    data:
      text: "Don't forget"
      taskId: { ref: "$existingTask.id" }
```

## Variable References

Reference captured values:

```yaml
setup:
  - insert: tasks
    data:
      title: "Parent"
    as: $parent

steps:
  - chat: "Create a subtask for $parent.title"
    created:
      - entity: tasks
        fields:
          parentId: { ref: "$parent.id" }
```

## Multi-Run Configuration

Run a scenario multiple times for flakiness detection:

```yaml
id: hal-001
name: Potential hallucination test
runs: 5                        # Run 5 times
steps:
  - chat: "Delete the task"
    tools:
      deleteTask: 1
```

## Complete Example

```yaml
name: Task Management Suite

scenarios:
  - id: task-001
    name: Create and complete task
    tags: [smoke, tasks]
    setup:
      - insert: tasks
        data:
          title: "Setup task"
          status: "todo"
        as: $setupTask

    steps:
      - chat: "Create a task called 'Review PR'"
        label: create
        tools:
          createTask: 1
        created:
          - entity: tasks
            as: $newTask
            fields:
              title: "Review PR"
              status: "todo"

      - chat: "Mark '$newTask.title' as complete"
        label: complete
        continueConversation: true
        tools:
          updateTask: 1

      - verify:
          entity: tasks
          id: $newTask.id
          fields:
            status: "completed"
```
