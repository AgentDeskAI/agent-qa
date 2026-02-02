/**
 * Relationship Assertions
 *
 * Parse and validate entity relationships from natural language.
 */

import type { RelationshipPattern } from '../config/types.js';

import type { AssertionResult, EntityRow } from './types.js';
import { pass, fail } from './types.js';

/**
 * Parsed relationship from text.
 */
export interface ParsedRelationship {
  /** Matched pattern name */
  patternName: string;
  /** Subject entity name/title */
  subject: string;
  /** Object entity name/title */
  object: string;
  /** Subject entity type */
  subjectEntity: string;
  /** Object entity type */
  objectEntity: string;
  /** Foreign key field */
  foreignKey: string;
  /** Subject lookup field (or undefined for default) */
  subjectLookupField?: string;
  /** Object lookup field (or undefined for default) */
  objectLookupField?: string;
}

/**
 * Parse a relationship from text using patterns.
 *
 * Example: "Task A is a subtask of Task B"
 * With pattern: { name: 'subtask', pattern: /(.+) is a subtask of (.+)/i, ... }
 */
export function parseRelationship(
  text: string,
  patterns: RelationshipPattern[]
): ParsedRelationship | null {
  for (const pattern of patterns) {
    const match = text.match(pattern.pattern);

    if (match && match[1] && match[2]) {
      return {
        patternName: pattern.name,
        subject: match[1].trim(),
        object: match[2].trim(),
        subjectEntity: pattern.subjectEntity,
        objectEntity: pattern.objectEntity,
        foreignKey: pattern.foreignKey,
        subjectLookupField: pattern.subjectLookupField,
        objectLookupField: pattern.objectLookupField,
      };
    }
  }

  return null;
}

/**
 * Assert a relationship exists between entities.
 */
export async function assertRelationship(
  parsed: ParsedRelationship,
  getEntity: (type: string, titleOrId: string, lookupField?: string) => Promise<EntityRow | null>
): Promise<AssertionResult> {
  // Find subject entity
  const subjectEntity = await getEntity(
    parsed.subjectEntity,
    parsed.subject,
    parsed.subjectLookupField
  );
  if (!subjectEntity) {
    return fail(`Subject entity not found: "${parsed.subject}" (${parsed.subjectEntity})`, {
      expected: 'entity exists',
      actual: null,
    });
  }

  // Find object entity
  const objectEntity = await getEntity(
    parsed.objectEntity,
    parsed.object,
    parsed.objectLookupField
  );
  if (!objectEntity) {
    return fail(`Object entity not found: "${parsed.object}" (${parsed.objectEntity})`, {
      expected: 'entity exists',
      actual: null,
    });
  }

  // Check foreign key relationship
  const foreignKeyValue = subjectEntity[parsed.foreignKey];

  if (foreignKeyValue === objectEntity.id) {
    return pass(
      `Relationship "${parsed.patternName}" verified: ` +
        `"${parsed.subject}" → "${parsed.object}" ` +
        `(${parsed.foreignKey} = ${objectEntity.id})`
    );
  }

  return fail(
    `Relationship "${parsed.patternName}" failed: expected "${parsed.subject}" to reference ` +
      `"${parsed.object}" via ${parsed.foreignKey}, but ${parsed.foreignKey} = ${String(foreignKeyValue)} ` +
      `(expected ${objectEntity.id})`,
    {
      expected: objectEntity.id,
      actual: foreignKeyValue,
    }
  );
}

/**
 * Extract all relationships from text using patterns.
 */
export function extractRelationships(
  text: string,
  patterns: RelationshipPattern[]
): ParsedRelationship[] {
  const relationships: ParsedRelationship[] = [];

  // Split text into sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  for (const sentence of sentences) {
    const parsed = parseRelationship(sentence, patterns);
    if (parsed) {
      relationships.push(parsed);
    }
  }

  return relationships;
}

/**
 * Validate all relationships extracted from text.
 */
export async function validateRelationships(
  text: string,
  patterns: RelationshipPattern[],
  getEntity: (type: string, titleOrId: string, lookupField?: string) => Promise<EntityRow | null>
): Promise<AssertionResult[]> {
  const relationships = extractRelationships(text, patterns);
  const results: AssertionResult[] = [];

  for (const relationship of relationships) {
    const result = await assertRelationship(relationship, getEntity);
    results.push(result);
  }

  return results;
}

/**
 * Default relationship patterns for common structures.
 */
export const defaultRelationshipPatterns: RelationshipPattern[] = [
  {
    name: 'subtask_of',
    pattern: /(.+)\s+is a subtask of\s+(.+)/i,
    subjectEntity: 'tasks',
    objectEntity: 'tasks',
    foreignKey: 'parentId',
  },
  {
    name: 'child_of',
    pattern: /(.+)\s+is a child of\s+(.+)/i,
    subjectEntity: 'tasks',
    objectEntity: 'tasks',
    foreignKey: 'parentId',
  },
  {
    name: 'belongs_to',
    pattern: /(.+)\s+belongs to\s+(.+)/i,
    subjectEntity: 'tasks',
    objectEntity: 'tasks',
    foreignKey: 'parentId',
  },
  {
    name: 'part_of',
    pattern: /(.+)\s+is part of\s+(.+)/i,
    subjectEntity: 'tasks',
    objectEntity: 'tasks',
    foreignKey: 'parentId',
  },
];
