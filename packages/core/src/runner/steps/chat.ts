/**
 * Chat Step Executor
 *
 * Executes chat steps and runs assertions.
 */

import { CostRegistry, type CostResult } from '@agent-qa/cost-registry';

import {
  assertToolCalls,
  assertTotalToolCalls,
  assertResponse,
  assertCreatedEntities,
  assertUsage,
  assertMessageProcessing,
  combineResults,
} from '../../assertions/index.js';
import { parseRelationship, assertRelationship } from '../../assertions/relationship.js';
import type { AssertionResult, EntityRow } from '../../assertions/types.js';
import { TEXT_TRUNCATE_LENGTH } from '../../constants.js';
import type { ChatStep } from '../../scenario/types.js';
import type { ExecutionContext } from '../context.js';
import type { ChatStepReport } from '../types.js';

// Shared cost registry instance
const costRegistry = CostRegistry.default();

/**
 * Options for executing a chat step.
 */
export interface ExecuteChatStepOptions {
  /** Step to execute */
  step: ChatStep;
  /** Execution context */
  context: ExecutionContext;
  /** Step index */
  index: number;
  /** Timeout override in milliseconds */
  timeout?: number;
}

/**
 * Execute a chat step.
 */
export async function executeChatStep(options: ExecuteChatStepOptions): Promise<ChatStepReport> {
  const { step, context, index, timeout } = options;
  const startTime = Date.now();
  const assertions: AssertionResult[] = [];

  try {
    // Determine conversation ID using simplified multi-conversation logic
    const conversationId = resolveConversationId(step, context);

    // Resolve any variables in the message
    const message = resolveVariables(step.chat, context);

    if (context.verbose) {
      console.log(`  Chat: "${truncate(message, TEXT_TRUNCATE_LENGTH)}"`);
    }

    // Send message to agent
    const response = await context.agent.chat({
      message,
      userId: context.userId,
      conversationId,
      maxToolCalls: step.maxToolCalls,
      timeout: timeout ?? step.timeout,
    });

    // Update conversation ID
    if (response.conversationId) {
      context.conversationId = response.conversationId;

      // Store conversation ID under the given name for future steps
      if (step.conversation) {
        context.setConversation(step.conversation, response.conversationId);
      }
    }

    // Update correlation ID (for tracing)
    if (response.correlationId) {
      context.correlationId = response.correlationId;
    }

    // Add usage
    if (response.usage) {
      context.addUsage(response.usage);
    }

    if (context.verbose) {
      console.log(`  Response: "${truncate(response.text, TEXT_TRUNCATE_LENGTH)}"`);
      if (response.toolCalls.length > 0) {
        console.log(`  Tools: ${response.toolCalls.map((t) => t.name).join(', ')}`);
      }
    }

    // Run tool assertions
    if (step.tools) {
      const toolResult = assertToolCalls(
        response.toolCalls,
        step.tools,
        { context: context.getMatcherContext() }
      );
      assertions.push(toolResult);
    }

    // Run total tool calls assertion
    if (step.totalToolCalls !== undefined) {
      const totalResult = assertTotalToolCalls(response.toolCalls, step.totalToolCalls);
      assertions.push(totalResult);
    }

    // Run response assertions
    if (step.response) {
      const responseResult = assertResponse(response.text, step.response);
      assertions.push(responseResult);
    }

    // Run usage assertions
    if (step.usage) {
      const usageResult = assertUsage(response.detailedUsage?.totals, step.usage);
      assertions.push(usageResult);
    }

    // Run message processing assertions
    if (step.messageProcessing) {
      const mpResult = assertMessageProcessing(response.messageProcessing, step.messageProcessing);
      assertions.push(mpResult);
    }

    // Run created entity assertions
    let captured: Record<string, unknown> = {};
    if (step.created && step.created.length > 0) {
      const createdResult = await assertCreatedEntities(
        context.database,
        step.created,
        context.getMatcherContext()
      );
      assertions.push(createdResult.result);

      // Capture entities
      captured = createdResult.captured;
      for (const [alias, entity] of Object.entries(createdResult.captured)) {
        context.capture(alias, entity);
      }

      // Run relationship assertions for captured entities
      if (context.relationshipPatterns.length > 0) {
        for (const createdAssertion of step.created) {
          if (createdAssertion.relationships?.length) {
            const relationshipResults = await assertRelationshipsForCreated(
              createdAssertion.relationships,
              context
            );
            assertions.push(...relationshipResults);
          }
        }
      }
    }

    // Combine all assertions
    const combinedResult = combineResults(assertions);
    const durationMs = Date.now() - startTime;

    // Calculate cost from usage data
    const cost = calculateCostFromResponse(response.detailedUsage);

    return {
      index,
      label: step.label,
      type: 'chat',
      status: combinedResult.passed ? 'passed' : 'failed',
      durationMs,
      error: combinedResult.passed ? undefined : combinedResult.message,
      assertions,
      message,
      response: response.text,
      toolCalls: response.toolCalls.map((t) => ({ name: t.name, args: t.args, result: t.result })),
      conversationId: response.conversationId,
      correlationId: response.correlationId,
      usage: response.usage,
      detailedUsage: response.detailedUsage,
      captured: captured as Record<string, EntityRow>,
      cost,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    return {
      index,
      label: step.label,
      type: 'chat',
      status: 'error',
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      assertions,
      message: step.chat,
    };
  }
}

/**
 * Resolve conversation ID from step configuration.
 *
 * Priority:
 * 1. conversation: "name" - Look up named conversation (returns undefined if new)
 * 2. continueConversation: true - Use context.conversationId
 * 3. conversationId: explicit ID
 * 4. Default: undefined (new conversation)
 */
function resolveConversationId(step: ChatStep, context: ExecutionContext): string | undefined {
  // Named conversation takes precedence
  if (step.conversation) {
    // Look up existing conversation by name (undefined = create new)
    return context.getConversation(step.conversation);
  }

  // Existing behavior: continueConversation
  if (step.continueConversation) {
    return context.conversationId ?? step.conversationId;
  }

  // Existing behavior: explicit conversationId
  return step.conversationId;
}

/**
 * Resolve variables in a string.
 */
function resolveVariables(text: string, context: ExecutionContext): string {
  return text.replace(/\$(\w+(?:\.\w+)?)/g, (match, ref) => {
    return context.resolve(`$${ref}`);
  });
}

/**
 * Truncate text for display.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Calculate cost from response detailed usage.
 *
 * Aggregates costs across all agents in the response.
 */
function calculateCostFromResponse(
  detailedUsage?: ChatStepReport['detailedUsage']
): CostResult | undefined {
  if (!detailedUsage?.agentSummaries?.length) {
    return undefined;
  }

  // Aggregate costs across all agents
  let totalInputCost = 0;
  let totalOutputCost = 0;
  let totalCacheWriteCost = 0;
  let totalCacheReadCost = 0;

  for (const agent of detailedUsage.agentSummaries) {
    const model = agent.model ?? 'claude-3-5-haiku-latest';
    // Detect provider from model name (API may report wrong provider for MiniMax)
    const provider = detectProvider(agent.provider, model);

    // Build usage object for cost calculation
    const usage = {
      inputTokens: agent.inputTokens,
      outputTokens: agent.outputTokens,
      cacheCreationTokens: detailedUsage.totals?.cacheCreationTokens,
      cacheReadTokens: detailedUsage.totals?.cacheReadTokens,
    };

    const agentCost = costRegistry.calculateLLM(provider, model, usage);

    totalInputCost += agentCost.inputCost;
    totalOutputCost += agentCost.outputCost;
    totalCacheWriteCost += agentCost.cacheWriteCost;
    totalCacheReadCost += agentCost.cacheReadCost;
  }

  return {
    inputCost: totalInputCost,
    outputCost: totalOutputCost,
    cachedInputCost: 0,
    cacheWriteCost: totalCacheWriteCost,
    cacheReadCost: totalCacheReadCost,
    totalCost: totalInputCost + totalOutputCost + totalCacheWriteCost + totalCacheReadCost,
    currency: 'USD',
  };
}

/**
 * Detect provider from model name.
 *
 * The API may report an incorrect provider for some models (e.g., MiniMax
 * models may be reported with provider "anthropic"). This function corrects
 * the provider based on the model name.
 */
function detectProvider(reportedProvider: string | undefined, model: string): string {
  // MiniMax models start with "MiniMax-"
  if (model.toLowerCase().startsWith('minimax-') || model.toLowerCase().startsWith('minimax')) {
    return 'minimax';
  }

  // OpenAI models
  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) {
    return 'openai';
  }

  // Default to reported provider or anthropic
  return reportedProvider ?? 'anthropic';
}

/**
 * Assert relationships for created entities.
 *
 * Each relationship text is parsed against configured patterns
 * and the FK relationship is validated in the database.
 */
async function assertRelationshipsForCreated(
  relationships: string[],
  context: ExecutionContext
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const text of relationships) {
    // Parse the relationship text against configured patterns
    const parsed = parseRelationship(text, context.relationshipPatterns);

    if (!parsed) {
      // No matching pattern - skip silently (pattern may not apply)
      continue;
    }

    // Assert the relationship exists
    const result = await assertRelationship(parsed, async (entityType, titleOrId) => {
      // Find by title (the natural language references entity titles)
      const byTitle = await context.database.findByTitle(entityType, titleOrId);
      return byTitle.entity ?? null;
    });

    results.push(result);
  }

  return results;
}
