/**
 * Conversation Store
 *
 * In-memory conversation history storage for the demo agent.
 * Enables multi-conversation testing by maintaining message history per conversation.
 */

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationStore {
  /**
   * Add a message to a conversation.
   */
  addMessage(conversationId: string, message: Message): void;

  /**
   * Get all messages for a conversation.
   */
  getMessages(conversationId: string): Message[];

  /**
   * Clear all conversations.
   */
  clear(): void;
}

function createConversationStore(): ConversationStore {
  const storage = new Map<string, Message[]>();

  return {
    addMessage(conversationId: string, message: Message): void {
      if (!storage.has(conversationId)) {
        storage.set(conversationId, []);
      }
      storage.get(conversationId)!.push(message);
    },

    getMessages(conversationId: string): Message[] {
      return storage.get(conversationId) ?? [];
    },

    clear(): void {
      storage.clear();
    },
  };
}

export const conversationStore = createConversationStore();
