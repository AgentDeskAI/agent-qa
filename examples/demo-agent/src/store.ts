/**
 * In-Memory Entity Store
 *
 * Simple storage for demo agent entities.
 * Persists in memory during the test run.
 */

import { randomUUID } from 'crypto';

export interface Entity {
  id: string;
  userId: string;
  title: string;
  status: string;
  createdAt: Date;
}

export interface EntityStore {
  create(type: string, userId: string, data: Partial<Entity>): Entity;
  list(type: string, userId: string): Entity[];
  findById(type: string, id: string): Entity | null;
  update(type: string, id: string, data: Partial<Entity>): Entity | null;
  delete(type: string, id: string): boolean;
  clear(): void;
}

function createEntityStore(): EntityStore {
  const storage = new Map<string, Map<string, Entity>>();

  return {
    create(type: string, userId: string, data: Partial<Entity>): Entity {
      const id = randomUUID();
      const entity: Entity = {
        id,
        userId,
        title: data.title ?? 'Untitled',
        status: data.status ?? 'todo',
        createdAt: new Date(),
      };

      if (!storage.has(type)) {
        storage.set(type, new Map());
      }
      storage.get(type)!.set(id, entity);

      return entity;
    },

    list(type: string, userId: string): Entity[] {
      const typeMap = storage.get(type);
      if (!typeMap) return [];
      return Array.from(typeMap.values()).filter((e) => e.userId === userId);
    },

    findById(type: string, id: string): Entity | null {
      return storage.get(type)?.get(id) ?? null;
    },

    update(type: string, id: string, data: Partial<Entity>): Entity | null {
      const entity = this.findById(type, id);
      if (!entity) return null;

      if (data.title !== undefined) entity.title = data.title;
      if (data.status !== undefined) entity.status = data.status;

      return entity;
    },

    delete(type: string, id: string): boolean {
      return storage.get(type)?.delete(id) ?? false;
    },

    clear(): void {
      storage.clear();
    },
  };
}

export const entityStore = createEntityStore();
