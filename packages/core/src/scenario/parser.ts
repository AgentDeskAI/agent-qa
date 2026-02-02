/**
 * Scenario Parser
 *
 * Parses YAML scenario files into Scenario objects.
 */

import { readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import type {
  Scenario,
  Step,
  ChatStep,
  VerifyStep,
  WaitStep,
  VerifyVectorsStep,
  ScenarioSetupStep,
  SourceLocation,
  ToolAssertion,
  SimpleToolAssertion,
} from './types.js';

/**
 * Error thrown when parsing fails.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly source?: SourceLocation
  ) {
    super(source ? `${message} at ${source.file}:${source.line ?? '?'}` : message);
    this.name = 'ParseError';
  }
}

/**
 * Parse a YAML scenario file.
 */
export function parseScenarioFile(filePath: string): Scenario {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseScenario(content, filePath);
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(
      `Failed to read scenario file: ${error instanceof Error ? error.message : String(error)}`,
      { file: filePath }
    );
  }
}

/**
 * Parse YAML content into a Scenario.
 */
export function parseScenario(content: string, filePath?: string): Scenario {
  const source: SourceLocation = { file: filePath ?? '<inline>' };

  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (error) {
    throw new ParseError(
      `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      source
    );
  }

  if (!raw || typeof raw !== 'object') {
    throw new ParseError('Scenario must be an object', source);
  }

  const data = raw as Record<string, unknown>;

  // Extract and validate required fields
  const id = extractString(data, 'id', source) ?? extractString(data, 'name', source);
  if (!id) {
    throw new ParseError('Scenario must have an "id" or "name" field', source);
  }

  // Extract optional fields
  const name = extractString(data, 'name', source);
  const description = extractString(data, 'description', source);
  const tags = extractStringArray(data, 'tags', source);
  const userId = extractString(data, 'userId', source);
  const timeout = extractNumber(data, 'timeout', source);
  const runs = extractNumber(data, 'runs', source);

  // Parse setup steps
  const setup = parseSetupSteps(data.setup, source);

  // Parse main steps
  const steps = parseSteps(data.steps, source);

  return {
    id,
    name,
    description,
    tags,
    setup,
    steps,
    userId,
    timeout,
    runs,
    source,
  };
}

/**
 * Parse multiple scenario files.
 */
export function parseScenarioFiles(filePaths: string[]): Scenario[] {
  return filePaths.map(parseScenarioFile);
}

// =============================================================================
// Step Parsing
// =============================================================================

function parseSteps(raw: unknown, source: SourceLocation): Step[] {
  if (!raw) {
    throw new ParseError('Scenario must have "steps" array', source);
  }

  if (!Array.isArray(raw)) {
    throw new ParseError('"steps" must be an array', source);
  }

  return raw.map((step, index) => parseStep(step, source, index));
}

function parseStep(raw: unknown, source: SourceLocation, index: number): Step {
  if (!raw || typeof raw !== 'object') {
    throw new ParseError(`Step ${index} must be an object`, source);
  }

  const data = raw as Record<string, unknown>;

  // Determine step type
  if ('chat' in data) {
    return parseChatStep(data, source, index);
  }

  if ('verify' in data) {
    return parseVerifyStep(data, source, index);
  }

  if ('wait' in data) {
    return parseWaitStep(data, source, index);
  }

  if ('setup' in data && Array.isArray(data.setup)) {
    return {
      label: extractString(data, 'label', source),
      setup: validateInlineSetupSteps(data.setup, source, index),
    };
  }

  if ('verifyVectors' in data) {
    return parseVerifyVectorsStep(data, source, index);
  }

  throw new ParseError(
    `Step ${index} must have "chat", "verify", "wait", "setup", or "verifyVectors" field`,
    source
  );
}

function parseChatStep(
  data: Record<string, unknown>,
  source: SourceLocation,
  index: number
): ChatStep {
  const chat = data.chat;
  if (typeof chat !== 'string') {
    throw new ParseError(`Step ${index}: "chat" must be a string`, source);
  }

  return {
    label: extractString(data, 'label', source),
    chat,
    tools: parseToolAssertions(data.tools, source, index),
    created: validateCreatedAssertions(data.created, source, index),
    response: validateResponseAssertions(data.response, source, index),
    continueConversation: extractBoolean(data, 'continueConversation', source),
    conversationId: extractString(data, 'conversationId', source),
    conversation: extractString(data, 'conversation', source),
    maxToolCalls: extractNumber(data, 'maxToolCalls', source),
    totalToolCalls: validateTotalToolCalls(data.totalToolCalls, source, index),
    usage: validateUsageAssertions(data.usage, source, index),
    timeout: extractNumber(data, 'timeout', source),
  };
}

function parseToolAssertions(
  raw: unknown,
  source: SourceLocation,
  index: number
): SimpleToolAssertion | ToolAssertion[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  // If it's an array, validate each tool assertion
  if (Array.isArray(raw)) {
    return raw.map((item, i) => {
      if (!item || typeof item !== 'object') {
        throw new ParseError(
          `Step ${index}: tools[${i}] must be an object with tool assertion properties`,
          source
        );
      }
      const obj = item as Record<string, unknown>;
      if (typeof obj.name !== 'string') {
        throw new ParseError(
          `Step ${index}: tools[${i}].name must be a string`,
          source
        );
      }
      // Cast through unknown since we've validated the required 'name' field
      return obj as unknown as ToolAssertion;
    });
  }

  // Otherwise it's SimpleToolAssertion (Record<string, number | { min, max }>)
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    // Validate each entry is either a number or { min?, max? }
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== 'number' && (typeof value !== 'object' || value === null)) {
        throw new ParseError(
          `Step ${index}: tools.${key} must be a number or { min?, max? }`,
          source
        );
      }
    }
    return raw as SimpleToolAssertion;
  }

  return undefined;
}

function parseVerifyStep(
  data: Record<string, unknown>,
  source: SourceLocation,
  index: number
): VerifyStep {
  const verify = data.verify;
  if (!verify || typeof verify !== 'object') {
    throw new ParseError(`Step ${index}: verify step must have verification object`, source);
  }

  return {
    label: extractString(data, 'label', source),
    verify: validateVerifyAssertions(verify, source, index),
  };
}

function parseWaitStep(
  data: Record<string, unknown>,
  source: SourceLocation,
  index: number
): WaitStep {
  const wait = data.wait;
  if (!wait || typeof wait !== 'object') {
    throw new ParseError(`Step ${index}: wait step must have condition object`, source);
  }

  return {
    label: extractString(data, 'label', source),
    wait: validateWaitCondition(wait, source, index),
    timeoutSeconds: extractNumber(data, 'timeoutSeconds', source),
    intervalSeconds: extractNumber(data, 'intervalSeconds', source),
  };
}

function parseVerifyVectorsStep(
  data: Record<string, unknown>,
  source: SourceLocation,
  index: number
): VerifyVectorsStep {
  const verifyVectors = data.verifyVectors;
  if (!Array.isArray(verifyVectors)) {
    throw new ParseError(
      `Step ${index}: verifyVectors must be an array of collection assertions`,
      source
    );
  }

  return {
    label: extractString(data, 'label', source),
    verifyVectors: validateVectorAssertions(verifyVectors, source, index),
  };
}

/**
 * Validate vector collection assertions.
 */
function validateVectorAssertions(
  assertions: unknown[],
  source: SourceLocation,
  index: number
): VerifyVectorsStep['verifyVectors'] {
  return assertions.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new ParseError(
        `Step ${index}: verifyVectors[${i}] must be an object`,
        source
      );
    }

    const obj = item as Record<string, unknown>;

    if (typeof obj.collection !== 'string') {
      throw new ParseError(
        `Step ${index}: verifyVectors[${i}].collection must be a string`,
        source
      );
    }

    if (!Array.isArray(obj.records)) {
      throw new ParseError(
        `Step ${index}: verifyVectors[${i}].records must be an array`,
        source
      );
    }

    return {
      collection: obj.collection,
      records: obj.records.map((record, j) => {
        if (!record || typeof record !== 'object') {
          throw new ParseError(
            `Step ${index}: verifyVectors[${i}].records[${j}] must be an object`,
            source
          );
        }

        const rec = record as Record<string, unknown>;

        // Validate 'id' is present (string or { ref: string })
        if (rec.id === undefined) {
          throw new ParseError(
            `Step ${index}: verifyVectors[${i}].records[${j}].id is required`,
            source
          );
        }

        // Validate 'exists' is boolean
        if (typeof rec.exists !== 'boolean') {
          throw new ParseError(
            `Step ${index}: verifyVectors[${i}].records[${j}].exists must be a boolean`,
            source
          );
        }

        // Construct the properly typed record assertion
        return {
          id: rec.id,
          exists: rec.exists,
          fields: rec.fields,
        } as VerifyVectorsStep['verifyVectors'][0]['records'][0];
      }),
    };
  });
}

// =============================================================================
// Setup Step Parsing
// =============================================================================

function parseSetupSteps(
  raw: unknown,
  source: SourceLocation
): ScenarioSetupStep[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!Array.isArray(raw)) {
    throw new ParseError('"setup" must be an array', source);
  }

  return raw.map((step, index) => parseSetupStep(step, source, index));
}

function parseSetupStep(
  raw: unknown,
  source: SourceLocation,
  index: number
): ScenarioSetupStep {
  if (!raw || typeof raw !== 'object') {
    throw new ParseError(`Setup step ${index} must be an object`, source);
  }

  const data = raw as Record<string, unknown>;

  if ('insert' in data) {
    return data as unknown as ScenarioSetupStep;
  }

  if ('process' in data) {
    return data as unknown as ScenarioSetupStep;
  }

  throw new ParseError(
    `Setup step ${index} must have "insert" or "process" field`,
    source
  );
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate inline setup steps.
 */
function validateInlineSetupSteps(
  steps: unknown[],
  source: SourceLocation,
  stepIndex: number
): Array<{ entity: string; data: Record<string, unknown>; as?: string }> {
  return steps.map((step, i) => {
    if (!step || typeof step !== 'object') {
      throw new ParseError(
        `Step ${stepIndex}: setup[${i}] must be an object`,
        source
      );
    }

    const obj = step as Record<string, unknown>;

    if (typeof obj.entity !== 'string') {
      throw new ParseError(
        `Step ${stepIndex}: setup[${i}].entity must be a string`,
        source
      );
    }

    if (!obj.data || typeof obj.data !== 'object') {
      throw new ParseError(
        `Step ${stepIndex}: setup[${i}].data must be an object`,
        source
      );
    }

    return {
      entity: obj.entity,
      data: obj.data as Record<string, unknown>,
      as: typeof obj.as === 'string' ? obj.as : undefined,
    };
  });
}

/**
 * Validate created assertions for chat step.
 */
function validateCreatedAssertions(
  created: unknown,
  source: SourceLocation,
  index: number
): ChatStep['created'] {
  if (created === undefined) {
    return undefined;
  }

  if (!Array.isArray(created)) {
    throw new ParseError(
      `Step ${index}: "created" must be an array of entity assertions`,
      source
    );
  }

  for (let i = 0; i < created.length; i++) {
    const item = created[i];
    if (!item || typeof item !== 'object') {
      throw new ParseError(
        `Step ${index}: created[${i}] must be an object`,
        source
      );
    }

    const obj = item as Record<string, unknown>;
    if (typeof obj.entity !== 'string') {
      throw new ParseError(
        `Step ${index}: created[${i}].entity must be a string`,
        source
      );
    }
  }

  return created as ChatStep['created'];
}

/**
 * Validate response assertions for chat step.
 */
function validateResponseAssertions(
  response: unknown,
  source: SourceLocation,
  index: number
): ChatStep['response'] {
  if (response === undefined) {
    return undefined;
  }

  if (!response || typeof response !== 'object') {
    throw new ParseError(
      `Step ${index}: "response" must be an object with assertion properties`,
      source
    );
  }

  return response as ChatStep['response'];
}

/**
 * Validate usage assertions for chat step.
 */
function validateUsageAssertions(
  usage: unknown,
  source: SourceLocation,
  index: number
): ChatStep['usage'] {
  if (usage === undefined) {
    return undefined;
  }

  if (!usage || typeof usage !== 'object') {
    throw new ParseError(
      `Step ${index}: "usage" must be an object with token assertion properties`,
      source
    );
  }

  const obj = usage as Record<string, unknown>;
  const validFields = [
    'cacheReadTokens',
    'cacheCreationTokens',
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'callCount',
    'anyOf',
    'allOf',
  ];

  // Validate each field
  for (const [key, value] of Object.entries(obj)) {
    if (!validFields.includes(key)) {
      throw new ParseError(
        `Step ${index}: usage.${key} is not a valid usage field. ` +
          `Valid fields: ${validFields.join(', ')}`,
        source
      );
    }

    // anyOf and allOf must be arrays of usage assertions
    if (key === 'anyOf' || key === 'allOf') {
      if (!Array.isArray(value)) {
        throw new ParseError(
          `Step ${index}: usage.${key} must be an array of usage assertions`,
          source
        );
      }
      // Recursively validate each sub-assertion
      for (let i = 0; i < value.length; i++) {
        validateUsageAssertions(value[i], source, index);
      }
      continue;
    }

    // Regular fields must be number or comparison matcher
    if (
      typeof value !== 'number' &&
      (typeof value !== 'object' || value === null)
    ) {
      throw new ParseError(
        `Step ${index}: usage.${key} must be a number or { gt?, gte?, lt?, lte? }`,
        source
      );
    }
  }

  return obj as ChatStep['usage'];
}

/**
 * Validate totalToolCalls assertion.
 */
function validateTotalToolCalls(
  totalToolCalls: unknown,
  source: SourceLocation,
  index: number
): ChatStep['totalToolCalls'] {
  if (totalToolCalls === undefined) {
    return undefined;
  }

  if (typeof totalToolCalls === 'number') {
    return totalToolCalls;
  }

  if (totalToolCalls && typeof totalToolCalls === 'object') {
    const obj = totalToolCalls as Record<string, unknown>;
    if (obj.min !== undefined && typeof obj.min !== 'number') {
      throw new ParseError(
        `Step ${index}: totalToolCalls.min must be a number`,
        source
      );
    }
    if (obj.max !== undefined && typeof obj.max !== 'number') {
      throw new ParseError(
        `Step ${index}: totalToolCalls.max must be a number`,
        source
      );
    }
    return obj as { min?: number; max?: number };
  }

  throw new ParseError(
    `Step ${index}: totalToolCalls must be a number or { min?, max? }`,
    source
  );
}

/**
 * Validate verify assertions.
 *
 * The entity name is taken from the parent key (e.g., 'tasks' in verify.tasks).
 * The array items contain matching criteria (title, id, fields, etc).
 */
function validateVerifyAssertions(
  verify: unknown,
  source: SourceLocation,
  index: number
): Record<string, Array<{ entity: string; [key: string]: unknown }>> {
  if (typeof verify !== 'object' || verify === null) {
    throw new ParseError(
      `Step ${index}: verify must be an object`,
      source
    );
  }

  const result: Record<string, Array<{ entity: string; [key: string]: unknown }>> = {};
  const obj = verify as Record<string, unknown>;

  for (const [entityName, value] of Object.entries(obj)) {
    if (!Array.isArray(value)) {
      throw new ParseError(
        `Step ${index}: verify.${entityName} must be an array`,
        source
      );
    }

    result[entityName] = value.map((item, i) => {
      if (!item || typeof item !== 'object') {
        throw new ParseError(
          `Step ${index}: verify.${entityName}[${i}] must be an object`,
          source
        );
      }

      const itemObj = item as Record<string, unknown>;

      // Auto-fill entity from the parent key if not provided
      return {
        entity: entityName,
        ...itemObj,
      } as { entity: string; [key: string]: unknown };
    });
  }

  return result;
}

/**
 * Validate wait condition.
 *
 * Supports two formats:
 * 1. Simple delay: { seconds: number }
 * 2. Entity polling: { entity: string, id: string | RefMatcher, fields: {...} }
 */
function validateWaitCondition(
  wait: unknown,
  source: SourceLocation,
  index: number
): WaitStep['wait'] {
  if (typeof wait !== 'object' || wait === null) {
    throw new ParseError(
      `Step ${index}: wait must be an object`,
      source
    );
  }

  const obj = wait as Record<string, unknown>;

  // Check for simple seconds-based delay
  if ('seconds' in obj && typeof obj.seconds === 'number') {
    return { seconds: obj.seconds };
  }

  // Must have entity or for_entity for polling mode
  if (typeof obj.entity !== 'string' && typeof obj.for_entity !== 'string') {
    throw new ParseError(
      `Step ${index}: wait must have "seconds" or "entity"/"for_entity" property`,
      source
    );
  }

  return wait as WaitStep['wait'];
}

// =============================================================================
// Utility Functions
// =============================================================================

function extractString(
  data: Record<string, unknown>,
  key: string,
  _source: SourceLocation
): string | undefined {
  const value = data[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return value;
}

function extractNumber(
  data: Record<string, unknown>,
  key: string,
  _source: SourceLocation
): number | undefined {
  const value = data[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number') {
    return undefined;
  }
  return value;
}

function extractBoolean(
  data: Record<string, unknown>,
  key: string,
  _source: SourceLocation
): boolean | undefined {
  const value = data[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    return undefined;
  }
  return value;
}

function extractStringArray(
  data: Record<string, unknown>,
  key: string,
  _source: SourceLocation
): string[] | undefined {
  const value = data[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((v): v is string => typeof v === 'string');
}
