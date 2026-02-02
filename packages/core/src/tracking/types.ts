/**
 * Tracking Types
 *
 * Interfaces for usage tracking.
 */

/**
 * Token usage.
 */
export interface TokenUsage {
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Total tokens */
  totalTokens: number;
}

/**
 * Model usage entry.
 */
export interface ModelUsage extends TokenUsage {
  /** Model name/ID */
  model: string;
  /** Number of requests */
  requests: number;
}

/**
 * Cost calculation.
 */
export interface CostInfo {
  /** Input token cost */
  inputCost: number;
  /** Output token cost */
  outputCost: number;
  /** Total cost */
  totalCost: number;
  /** Currency */
  currency: string;
}

/**
 * Usage tracker interface.
 */
export interface UsageTracker {
  /**
   * Track usage from an operation.
   */
  track(usage: TrackUsageOptions): void;

  /**
   * Get total usage.
   */
  getTotal(): TokenUsage;

  /**
   * Get usage by model.
   */
  getByModel(): ModelUsage[];

  /**
   * Get estimated cost.
   */
  getCost(): CostInfo;

  /**
   * Reset the tracker.
   */
  reset(): void;
}

/**
 * Options for tracking usage.
 */
export interface TrackUsageOptions {
  /** Model name/ID */
  model?: string;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Model pricing configuration.
 */
export interface ModelPricing {
  /** Input token price per million */
  inputPricePerMillion: number;
  /** Output token price per million */
  outputPricePerMillion: number;
}

/**
 * Usage tracker options.
 */
export interface UsageTrackerOptions {
  /** Model pricing (model name -> pricing) */
  pricing?: Record<string, ModelPricing>;
  /** Default pricing for unknown models */
  defaultPricing?: ModelPricing;
  /** Currency for cost calculations */
  currency?: string;
}
