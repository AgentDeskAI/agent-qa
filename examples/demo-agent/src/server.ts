/**
 * Demo Agent Server
 *
 * Minimal Fastify server using AI SDK v6 ToolLoopAgent.
 * Provides a real LLM-powered agent for testing the agent-qa framework.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { entityStore } from './store.js';
import { conversationStore } from './conversation-store.js';
import { handleManageTasks, type ManageTasksArgs } from './tools.js';
import { generateConversationId } from './utils.js';

interface ToolCall {
  name: string;
  args: unknown;
  result: unknown;
}

interface ChatRequest {
  message: string;
  userId: string;
  conversationId?: string;
}

/**
 * Create the demo agent server.
 */
export async function createDemoServer(port = 4099): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const anthropic = createAnthropic();

  // POST /v1/chat - Main chat endpoint
  app.post<{ Body: ChatRequest }>('/v1/chat', async (request) => {
    const { message, userId, conversationId: inputConvId } = request.body;

    // Generate conversation ID if not provided
    const conversationId = inputConvId || generateConversationId();

    // Store user message in conversation history
    conversationStore.addMessage(conversationId, { role: 'user', content: message });

    // Get full conversation history for context
    const history = conversationStore.getMessages(conversationId);

    // Collect tool calls during execution
    const toolCalls: ToolCall[] = [];

    // Define schema for tool input
    const ManageTasksSchema = z.object({
      action: z.enum(['create', 'list', 'update', 'delete', 'complete']),
      title: z.string().optional().describe('Title for the task (required for create)'),
      taskId: z.string().optional().describe('ID of task (required for update/delete/complete)'),
      status: z.enum(['todo', 'done']).optional().describe('New status for update'),
    });

    // Create the manageTasks tool using AI SDK v6 tool() helper (inputSchema like PocketCoach)
    const manageTasks = tool({
      description:
        'Create, list, update, delete, or complete tasks. Use action: "create" with title to create a new task. Use action: "list" to list all tasks. Use action: "complete" or "update" with taskId to update a task. Use action: "delete" with taskId to delete a task.',
      inputSchema: ManageTasksSchema,
      execute: async (args: z.infer<typeof ManageTasksSchema>) => {
        const result = handleManageTasks(args as ManageTasksArgs, userId, entityStore);
        toolCalls.push({ name: 'manageTasks', args, result });
        return result;
      },
    });

    // Create ToolLoopAgent (matches PocketCoach pattern)
    const agent = new ToolLoopAgent({
      model: anthropic('claude-haiku-4-5'),
      instructions: `You are a task management assistant. Help users manage their tasks by using the available tools.

Rules:
- When asked to create a task, use the manageTasks tool with action: "create" and the task title.
- When asked to list tasks, use the manageTasks tool with action: "list".
- When asked to complete a task, use the manageTasks tool with action: "complete" and the taskId.
- When asked to delete a task, use the manageTasks tool with action: "delete" and the taskId.
- Keep responses concise.
- Always confirm what action you took.`,
      tools: { manageTasks },
      stopWhen: stepCountIs(5),
    });

    // Run the agent with full conversation history for context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await agent.generate({
      messages: history.map((m) => ({ role: m.role, content: m.content })) as any,
    });

    // Extract text from the result
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (result as any).text ?? '';

    // Store assistant response in conversation history
    conversationStore.addMessage(conversationId, { role: 'assistant', content: text });

    return {
      text,
      toolCalls,
      conversationId,
    };
  });

  // GET /health - Health check
  app.get('/health', () => ({ status: 'ok' }));

  // POST /reset - Reset all data (for testing)
  app.post('/reset', () => {
    entityStore.clear();
    conversationStore.clear();
    return { success: true };
  });

  // Start the server
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Demo agent listening on port ${port}`);

  return app;
}

// Allow running directly for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  createDemoServer(4099);
}
