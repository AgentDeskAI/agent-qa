/**
 * Tool Handlers
 *
 * Business logic for demo agent tools.
 */

import type { EntityStore } from './store.js';

export interface ManageTasksArgs {
  action: 'create' | 'list' | 'update' | 'delete' | 'complete';
  title?: string;
  taskId?: string;
  status?: 'todo' | 'done';
}

export interface ManageTasksResult {
  success: boolean;
  task?: {
    id: string;
    title: string;
    status: string;
  };
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  error?: string;
}

/**
 * Handle manageTasks tool calls.
 */
export function handleManageTasks(
  args: ManageTasksArgs,
  userId: string,
  store: EntityStore,
): ManageTasksResult {
  switch (args.action) {
    case 'create': {
      const task = store.create('tasks', userId, {
        title: args.title ?? 'Untitled',
        status: 'todo',
      });
      return {
        success: true,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
        },
      };
    }

    case 'list': {
      const entities = store.list('tasks', userId);
      const tasks = entities.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
      }));
      return { success: true, tasks };
    }

    case 'complete':
    case 'update': {
      if (!args.taskId) {
        return { success: false, error: 'taskId required' };
      }
      const updated = store.update('tasks', args.taskId, {
        status: args.status ?? 'done',
      });
      if (!updated) {
        return { success: false, error: 'Task not found' };
      }
      return {
        success: true,
        task: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
        },
      };
    }

    case 'delete': {
      if (!args.taskId) {
        return { success: false, error: 'taskId required' };
      }
      const deleted = store.delete('tasks', args.taskId);
      return { success: deleted, error: deleted ? undefined : 'Task not found' };
    }

    default:
      return { success: false, error: 'Unknown action' };
  }
}
