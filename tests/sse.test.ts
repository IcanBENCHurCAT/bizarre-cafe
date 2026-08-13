import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseMessage } from '../src/sse/index';

describe('SSE parseMessage Unit Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should successfully parse valid JSON into a SseMessage', () => {
    const raw = JSON.stringify({
      type: 'chat',
      roomId: 'room-123',
      content: 'Hello, world!',
      agentId: 'agent-456',
      timestamp: 1600000000000,
    });

    const result = parseMessage(raw);

    expect(result).toBeDefined();
    expect(result).toEqual({
      type: 'chat',
      roomId: 'room-123',
      content: 'Hello, world!',
      agentId: 'agent-456',
      timestamp: 1600000000000,
    });
  });

  it('should return undefined if JSON parsing throws an error', () => {
    const raw = '{ invalid-json: }';
    const result = parseMessage(raw);
    expect(result).toBeUndefined();
  });

  it('should return undefined if the parsed object is null or undefined', () => {
    const resultNull = parseMessage('null');
    expect(resultNull).toBeUndefined();
  });

  it('should return undefined if type is missing or not a string', () => {
    const rawNoType = JSON.stringify({
      roomId: 'room-123',
      content: 'Hello',
    });
    expect(parseMessage(rawNoType)).toBeUndefined();

    const rawNonStringType = JSON.stringify({
      type: 123,
      roomId: 'room-123',
      content: 'Hello',
    });
    expect(parseMessage(rawNonStringType)).toBeUndefined();
  });

  it('should populate timestamp with current time if timestamp is missing in the message', () => {
    const fakeTime = 1700000000000;
    vi.setSystemTime(fakeTime);

    const raw = JSON.stringify({
      type: 'chat',
      roomId: 'room-123',
      content: 'Hello',
    });

    const result = parseMessage(raw);

    expect(result).toBeDefined();
    expect(result?.timestamp).toBe(fakeTime);
  });
});
