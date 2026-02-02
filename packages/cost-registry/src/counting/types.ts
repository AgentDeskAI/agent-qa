/**
 * Token counting types.
 */

/**
 * Tiktoken encoding options.
 */
export type TiktokenEncoding = 'cl100k_base' | 'o200k_base' | 'p50k_base' | 'r50k_base';

/**
 * Anthropic model names for token counting.
 */
export type AnthropicModel =
  | 'claude-opus-4-5' | 'claude-opus-4-5-20251101'
  | 'claude-sonnet-4-5' | 'claude-sonnet-4-5-20250929'
  | 'claude-sonnet-4-0' | 'claude-sonnet-4-20250514'
  | 'claude-haiku-4-5' | 'claude-haiku-4-5-20251001'
  | 'claude-3-5-haiku-latest' | 'claude-3-5-haiku-20241022'
  | 'claude-3-7-sonnet-latest' | 'claude-3-7-sonnet-20250219'
  | 'claude-3-opus-latest' | 'claude-3-opus-20240229'
  | (string & {}); // Allow any string for future models

/**
 * Message format for Anthropic token counting.
 */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

/**
 * Tool definition in Anthropic API format.
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: unknown;
}

/**
 * Full request input for Anthropic token counting.
 */
export interface AnthropicCountInput {
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
  thinking?: { type: 'enabled'; budget_tokens: number } | { type: 'disabled' };
}

/**
 * Options for creating a token counter.
 */
export interface TokenCounterOptions {
  /**
   * Tiktoken encoding to use (for local counting).
   * @default 'cl100k_base'
   */
  encoding?: TiktokenEncoding;

  /**
   * Anthropic model to use for API-based counting.
   * When specified, uses Anthropic's count_tokens API instead of tiktoken.
   */
  model?: AnthropicModel;

  /**
   * Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.
   */
  apiKey?: string;

  /**
   * Anthropic API base URL.
   * @default 'https://api.anthropic.com'
   */
  baseUrl?: string;
}

/**
 * Sync token counter function type (tiktoken).
 */
export interface SyncTokenCounter {
  (text: string): number;
  readonly isAsync: false;
  getEncodingOrModel(): string;
}

/**
 * Async token counter function type (Anthropic API).
 */
export interface AsyncTokenCounter {
  (text: string): Promise<number>;
  (input: AnthropicCountInput): Promise<number>;
  readonly isAsync: true;
  getEncodingOrModel(): string;
}

/**
 * Token counter type - either sync (tiktoken) or async (Anthropic API).
 */
export type TokenCounter = SyncTokenCounter | AsyncTokenCounter;
