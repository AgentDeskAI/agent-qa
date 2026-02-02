/**
 * Agent-QA Configuration for Demo Agent
 *
 * This configures the agent-qa framework to test against our demo ToolLoopAgent.
 * Note: This is a simplified config for the demo - it uses in-memory storage
 * instead of a real database, so we bypass the normal agent-qa type requirements.
 */

// Export a plain object config - the demo runner will handle this specially
const config = {
  name: 'DemoAgent',
  // Skip globalSetup - run the server manually with `pnpm dev` before running tests
  // globalSetup: './agentqa.setup.ts',
  defaultUserId: 'demo-user-001',

  // Clean up entities before each scenario by calling the reset endpoint
  hooks: {
    beforeEach: async () => {
      await fetch('http://localhost:4099/reset', { method: 'POST' });
    },
  },

  agent: {
    baseUrl: 'http://localhost:4099',
    token: 'demo-token',
    chatEndpoint: '/v1/chat',
  },

  // In-memory storage - no real database needed
  database: null,
};

export default config;
