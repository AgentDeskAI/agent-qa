# @agent-qa/core

## 0.1.1

### Patch Changes

- [#3](https://github.com/AgentDeskAI/agent-qa/pull/3) [`d5ba7a6`](https://github.com/AgentDeskAI/agent-qa/commit/d5ba7a603a83cc120f4d3c54db26af5891e72874) Thanks [@tedjames](https://github.com/tedjames)! - Fix tool call assertions to only count current turn tool calls

  When running multi-turn conversation tests, tool call assertions now correctly filter out tool calls from previous turns (origin: 'history') and only include tool calls from the current turn (origin: 'current' or undefined for backward compatibility).

  This prevents false test failures in scenarios like:

  ```yaml
  steps:
    - chat: "Create a task"
      tools:
        manageTasks: 1 # Now correctly counts only current turn

    - chat: "Update the task"
      tools:
        manageTasks: 1 # Previously failed (counted 2), now passes (counts 1)
  ```
