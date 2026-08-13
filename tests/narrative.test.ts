import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEventHistory,
  trackEvent,
  getEventsByType,
  resetStore,
  generateResponse,
} from '../src/services/narrative';

describe('Narrative Engine Service', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Store and Event History', () => {
    it('should initially return an empty array from getEventHistory', () => {
      expect(getEventHistory()).toEqual([]);
    });

    it('should not leak internal references from getEventHistory', () => {
      const history1 = getEventHistory();
      const history2 = getEventHistory();

      // The arrays should have the same elements but different references
      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2);

      // Mutating one array should not affect the other or the store
      history1.push({
        id: 'fake-id',
        type: 'fake-type',
        data: {},
        timestamp: Date.now(),
      });
      expect(getEventHistory()).toEqual([]);
    });

    it('should correctly track events with trackEvent', () => {
      const eventType = 'CUSTOMER_ENTER';
      const eventData = { customerId: 'agent-123', table: 4 };

      const event = trackEvent(eventType, eventData);

      expect(event).toBeDefined();
      expect(event.id).toHaveLength(32); // as generateId returns a 32-char hex string
      expect(event.type).toBe(eventType);
      expect(event.data).toEqual(eventData);
      expect(event.timestamp).toBeLessThanOrEqual(Date.now());
      expect(event.narrative).toContain(eventType);

      const history = getEventHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(event);
    });

    it('should filter events by type using getEventsByType', () => {
      trackEvent('CUSTOMER_ENTER', { id: 1 });
      trackEvent('CUSTOMER_LEAVE', { id: 1 });
      trackEvent('CUSTOMER_ENTER', { id: 2 });

      const enterEvents = getEventsByType('CUSTOMER_ENTER');
      expect(enterEvents).toHaveLength(2);
      expect(enterEvents.every(e => e.type === 'CUSTOMER_ENTER')).toBe(true);

      const leaveEvents = getEventsByType('CUSTOMER_LEAVE');
      expect(leaveEvents).toHaveLength(1);
      expect(leaveEvents[0].type).toBe('CUSTOMER_LEAVE');

      const nonexistentEvents = getEventsByType('ORDER_PLACED');
      expect(nonexistentEvents).toEqual([]);
    });

    it('should clear all events when resetStore is called', () => {
      trackEvent('CUSTOMER_ENTER');
      trackEvent('CUSTOMER_LEAVE');

      expect(getEventHistory()).toHaveLength(2);

      resetStore();

      expect(getEventHistory()).toEqual([]);
    });
  });

  describe('generateResponse', () => {
    it('should successfully generate response via mocked OpenAI API', async () => {
      const mockResponseData = {
        choices: [
          {
            message: {
              content: 'Welcome to the Bizarre Cafe, my automated friend!',
            },
          },
        ],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponseData,
      });

      vi.stubGlobal('fetch', fetchMock);

      const response = await generateResponse('A customer has entered', 'Say welcome', 'whimsical');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
      expect(calledUrl).toContain('/chat/completions');
      expect(calledOptions.method).toBe('POST');

      const body = JSON.parse(calledOptions.body);
      expect(body.model).toBeDefined();
      expect(body.messages[0].content).toContain('whimsical');

      expect(response).toBeDefined();
      expect(response.id).toHaveLength(32);
      expect(response.content).toBe('Welcome to the Bizarre Cafe, my automated friend!');
      expect(response.tone).toBe('whimsical');
      expect(response.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should fall back gracefully if fetch throws an error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchMock);

      const response = await generateResponse('Contextual info', 'Custom prompt', 'mysterious');

      expect(response).toBeDefined();
      expect(response.content).toBe('[mysterious] Response to: "Custom prompt" — Contextual info');
      expect(response.tone).toBe('mysterious');
    });

    it('should fall back gracefully if fetch returns non-ok response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', fetchMock);

      const response = await generateResponse('Contextual info', undefined, 'helpful');

      expect(response).toBeDefined();
      expect(response.content).toBe('[helpful] Narrative context: Contextual info');
      expect(response.tone).toBe('helpful');
    });
  });
});
