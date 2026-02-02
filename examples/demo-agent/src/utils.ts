/**
 * Utility Functions
 */

import { randomUUID } from 'crypto';

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Generate a conversation ID.
 */
export function generateConversationId(): string {
  return `conv_${randomUUID().slice(0, 8)}`;
}
