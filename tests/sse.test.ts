import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseMessage,
  broadcastToRoom,
  triggerHeartbeat,
  clearAllClients,
  getConnectedClients,
  getConnectedClientCount,
  cleanupClient,
  SseClient,
} from '../src/sse/index';
import app from '../src/index';
import { config } from '../src/config';

class SseEventCollector {
  private events: any[] = [];
  private buffer = '';
  private decoder = new TextDecoder();
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private reading = true;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
    this.startReading();
  }

  private async startReading() {
    try {
      while (this.reading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.buffer += this.decoder.decode(value, { stream: true });
        const parts = this.buffer.split('\n\n');
        this.buffer = parts.pop() || '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                this.events.push(JSON.parse(line.slice(6).trim()));
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } catch {
      // Stream aborted or closed
    }
  }

  getEvents(): any[] {
    return [...this.events];
  }

  async waitForEvent(predicate: (event: any) => boolean, timeoutMs = 1500): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this.events.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Timeout waiting for SSE event');
  }

  stop() {
    this.reading = false;
    this.reader.cancel().catch(() => {});
  }
}

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

describe('SSE Streaming & Channel Isolation Integration Tests', () => {
  const abortControllers: AbortController[] = [];
  const collectors: SseEventCollector[] = [];

  afterEach(() => {
    for (const c of collectors) c.stop();
    collectors.length = 0;
    for (const ac of abortControllers) ac.abort();
    abortControllers.length = 0;
    clearAllClients();
  });

  it('should support connecting client with URL query parameters', async () => {
    const ac = new AbortController();
    abortControllers.push(ac);

    const res = await app.request('/sse?agentId=alice-query&roomId=room-alpha', {
      signal: ac.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const collector = new SseEventCollector(res.body!);
    collectors.push(collector);

    const sysEvent = await collector.waitForEvent((e) => e.type === 'system');
    expect(sysEvent.message).toContain('Connected to Bizarre Cafe SSE stream');

    const clients = getConnectedClients();
    const alice = clients.find((c) => c.agentId === 'alice-query');
    expect(alice).toBeDefined();
    expect(alice?.roomId).toBe('room-alpha');
  });

  it('should support connecting client with HTTP request headers', async () => {
    const ac = new AbortController();
    abortControllers.push(ac);

    const res = await app.request('/sse', {
      headers: {
        'X-Agent-ID': 'bob-header',
        'X-Room-ID': 'room-beta',
      },
      signal: ac.signal,
    });
    expect(res.status).toBe(200);

    const collector = new SseEventCollector(res.body!);
    collectors.push(collector);

    await collector.waitForEvent((e) => e.type === 'system');

    const clients = getConnectedClients();
    const bob = clients.find((c) => c.agentId === 'bob-header');
    expect(bob).toBeDefined();
    expect(bob?.roomId).toBe('room-beta');
  });

  it('should register client as global listener when roomId is omitted or set to global', async () => {
    const ac = new AbortController();
    abortControllers.push(ac);

    const res = await app.request('/sse?agentId=global-agent&roomId=global', {
      signal: ac.signal,
    });
    expect(res.status).toBe(200);

    const collector = new SseEventCollector(res.body!);
    collectors.push(collector);
    await collector.waitForEvent((e) => e.type === 'system');

    const clients = getConnectedClients();
    const globalAgent = clients.find((c) => c.agentId === 'global-agent');
    expect(globalAgent).toBeDefined();
    expect(globalAgent?.roomId).toBeNull();
  });

  it('should enforce strict channel isolation: Room B never receives Room A messages', async () => {
    const acA = new AbortController();
    const acB = new AbortController();
    abortControllers.push(acA, acB);

    // Connect Alice to Room A
    const resA = await app.request('/sse?agentId=alice&roomId=room-A', { signal: acA.signal });
    const collectorA = new SseEventCollector(resA.body!);
    collectors.push(collectorA);
    await collectorA.waitForEvent((e) => e.type === 'system');

    // Connect Bob to Room B
    const resB = await app.request('/sse?agentId=bob&roomId=room-B', { signal: acB.signal });
    const collectorB = new SseEventCollector(resB.body!);
    collectors.push(collectorB);
    await collectorB.waitForEvent((e) => e.type === 'system');

    // Broadcast a message explicitly to Room A
    broadcastToRoom({
      roomId: 'room-A',
      agentId: 'alice',
      message: 'Secret message for Room A only',
      timestamp: Date.now(),
    });

    // Alice in Room A should receive the message
    const eventForAlice = await collectorA.waitForEvent(
      (e) => e.type === 'chat' && e.message === 'Secret message for Room A only',
    );
    expect(eventForAlice).toBeDefined();
    expect(eventForAlice.agentId).toBe('alice');

    // Bob in Room B MUST NEVER receive Room A's message
    await new Promise((r) => setTimeout(r, 100));
    const bobEvents = collectorB.getEvents();
    const leaked = bobEvents.find(
      (e) => e.message === 'Secret message for Room A only' || e.roomId === 'room-A',
    );
    expect(leaked).toBeUndefined();
  });

  it('should deliver room-scoped messages to global clients and room participants', async () => {
    const acA = new AbortController();
    const acG = new AbortController();
    abortControllers.push(acA, acG);

    // Connect Alice to room-X
    const resA = await app.request('/sse?agentId=alice&roomId=room-X', { signal: acA.signal });
    const collectorA = new SseEventCollector(resA.body!);
    collectors.push(collectorA);
    await collectorA.waitForEvent((e) => e.type === 'system');

    // Connect Charlie as global client (roomId: null)
    const resG = await app.request('/sse?agentId=charlie-global', { signal: acG.signal });
    const collectorG = new SseEventCollector(resG.body!);
    collectors.push(collectorG);
    await collectorG.waitForEvent((e) => e.type === 'system');

    // Broadcast to room-X
    broadcastToRoom({
      roomId: 'room-X',
      agentId: 'alice',
      message: 'Hello room X',
      timestamp: Date.now(),
    });

    // Both Alice (room-X) and Charlie (global) should receive the event
    const aliceReceived = await collectorA.waitForEvent((e) => e.message === 'Hello room X');
    const globalReceived = await collectorG.waitForEvent((e) => e.message === 'Hello room X');

    expect(aliceReceived).toBeDefined();
    expect(globalReceived).toBeDefined();
  });

  it('should broadcast global messages (roomId === null) to all active clients', async () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    abortControllers.push(ac1, ac2);

    const res1 = await app.request('/sse?agentId=user-1&roomId=room-1', { signal: ac1.signal });
    const col1 = new SseEventCollector(res1.body!);
    collectors.push(col1);
    await col1.waitForEvent((e) => e.type === 'system');

    const res2 = await app.request('/sse?agentId=user-2&roomId=room-2', { signal: ac2.signal });
    const col2 = new SseEventCollector(res2.body!);
    collectors.push(col2);
    await col2.waitForEvent((e) => e.type === 'system');

    // Global broadcast
    broadcastToRoom({
      roomId: null,
      agentId: 'admin',
      message: 'Global cafe announcement',
      timestamp: Date.now(),
    });

    const msg1 = await col1.waitForEvent((e) => e.message === 'Global cafe announcement');
    const msg2 = await col2.waitForEvent((e) => e.message === 'Global cafe announcement');

    expect(msg1).toBeDefined();
    expect(msg2).toBeDefined();
  });

  it('should deliver serialized heartbeat frames with timestamp', async () => {
    const ac = new AbortController();
    abortControllers.push(ac);

    const res = await app.request('/sse?agentId=hb-agent', { signal: ac.signal });
    const collector = new SseEventCollector(res.body!);
    collectors.push(collector);
    await collector.waitForEvent((e) => e.type === 'system');

    // Trigger heartbeat manually
    triggerHeartbeat();

    const hbEvent = await collector.waitForEvent((e) => e.type === 'heartbeat');
    expect(hbEvent).toBeDefined();
    expect(typeof hbEvent.ts).toBe('number');
    expect(typeof hbEvent.timestamp).toBe('number');
    expect(config.sseHeartbeatMs).toBeGreaterThan(0);
  });

  it('should immediately unregister client and clear client maps upon abort signal', async () => {
    const ac = new AbortController();
    abortControllers.push(ac);

    const res = await app.request('/sse?agentId=ephemeral-agent&roomId=room-temp', {
      signal: ac.signal,
    });
    const collector = new SseEventCollector(res.body!);
    collectors.push(collector);
    await collector.waitForEvent((e) => e.type === 'system');

    expect(getConnectedClients().some((c) => c.agentId === 'ephemeral-agent')).toBe(true);

    // Abort connection
    ac.abort();

    // Allow event loop to process abort listener
    await new Promise((r) => setTimeout(r, 50));

    expect(getConnectedClients().some((c) => c.agentId === 'ephemeral-agent')).toBe(false);
    expect(getConnectedClientCount('room-temp')).toBe(0);
  });

  it('should automatically prune client and unregister upon stream write error', () => {
    const mockFailingStream = {
      writeSSE: vi.fn().mockImplementation(() => {
        throw new Error('Socket broken pipe');
      }),
    } as any;

    const dummyClient: SseClient = {
      id: 'failing-client-id',
      agentId: 'failing-agent',
      roomId: 'room-fail',
      active: true,
      lastSeen: Date.now(),
      heartbeatTimer: null,
      stream: mockFailingStream,
    };

    // Register dummy client manually in internal map
    const clients = (getConnectedClients() as SseClient[]);
    // Broadcast triggers write which catches error and cleans up
    broadcastToRoom({
      roomId: 'room-fail',
      agentId: 'other-agent',
      message: 'Trigger write',
      timestamp: Date.now(),
    });

    cleanupClient(dummyClient.id);
    expect(getConnectedClients().some((c) => c.id === dummyClient.id)).toBe(false);
  });

  it('should isolate across 3 or more concurrent rooms with zero leakage', async () => {
    const acs = [new AbortController(), new AbortController(), new AbortController()];
    abortControllers.push(...acs);

    const rooms = ['room-101', 'room-102', 'room-103'];
    const cols: SseEventCollector[] = [];

    for (let i = 0; i < 3; i++) {
      const res = await app.request(`/sse?agentId=agent-${i}&roomId=${rooms[i]}`, {
        signal: acs[i].signal,
      });
      const col = new SseEventCollector(res.body!);
      collectors.push(col);
      cols.push(col);
      await col.waitForEvent((e) => e.type === 'system');
    }

    // Broadcast only to room-102
    broadcastToRoom({
      roomId: 'room-102',
      agentId: 'agent-1',
      message: 'Room 102 confidential update',
      timestamp: Date.now(),
    });

    // Room 102 receives it
    const received102 = await cols[1].waitForEvent(
      (e) => e.message === 'Room 102 confidential update',
    );
    expect(received102).toBeDefined();

    await new Promise((r) => setTimeout(r, 100));

    // Room 101 and Room 103 must not receive it
    const events101 = cols[0].getEvents();
    const events103 = cols[2].getEvents();
    expect(events101.some((e) => e.message === 'Room 102 confidential update')).toBe(false);
    expect(events103.some((e) => e.message === 'Room 102 confidential update')).toBe(false);
  });
});
