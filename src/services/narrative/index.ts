/**
 * Narrative Engine Service
 *
 * Generates narrative responses and tracks events for the Bizarre Cafe platform.
 *
 * The narrative engine is responsible for:
 * - Generating contextually appropriate narrative responses
 * - Tracking events in the narrative timeline
 * - Maintaining the owner's whimsical but helpful voice
 */

import crypto from 'node:crypto';

export interface NarrativeEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
  narrative?: string;
}

export interface NarrativeResponse {
  id: string;
  content: string;
  tone: 'whimsical' | 'helpful' | 'mysterious' | 'encouraging';
  timestamp: number;
}

interface NarrativeStore {
  events: NarrativeEvent[];
}

const store: NarrativeStore = {
  events: [],
};

/**
 * Generate a unique ID.
 */
function generateId(length = 32): string {
  return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Generate a narrative response based on context and prompt.
 *
 * In production, this would call an LLM to generate a response.
 * For testing, returns a canned response with the appropriate tone.
 */
export function generateResponse(
  context: string,
  prompt?: string,
  tone?: 'whimsical' | 'helpful' | 'mysterious' | 'encouraging',
): NarrativeResponse {
  const id = generateId();

  // Determine tone if not specified
  const resolvedTone = tone ?? 'whimsical';

  // Generate a narrative response based on context
  let content: string;
  if (prompt) {
    content = `[${resolvedTone}] Response to: "${prompt}" — ${context}`;
  } else {
    content = `[${resolvedTone}] Narrative context: ${context}`;
  }

  const response: NarrativeResponse = {
    id,
    content,
    tone: resolvedTone,
    timestamp: Date.now(),
  };

  return response;
}

/**
 * Track a narrative event.
 *
 * Events are stored in memory and can include contextual data
 * that the narrative engine can reference later.
 */
export function trackEvent(
  type: string,
  data: Record<string, unknown> = {},
): NarrativeEvent {
  const event: NarrativeEvent = {
    id: generateId(),
    type,
    data,
    timestamp: Date.now(),
  };

  store.events.push(event);

  // Generate a narrative for the event
  event.narrative = `[${event.type}] Event recorded at ${new Date(event.timestamp).toISOString()}`;

  return event;
}

/**
 * Get the narrative event history.
 */
export function getEventHistory(): NarrativeEvent[] {
  return [...store.events];
}

/**
 * Get events of a specific type.
 */
export function getEventsByType(type: string): NarrativeEvent[] {
  return store.events.filter((e) => e.type === type);
}

/**
 * Reset the in-memory store (useful for tests).
 */
export function resetStore(): void {
  store.events = [];
}
