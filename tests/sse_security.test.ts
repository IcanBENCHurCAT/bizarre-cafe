import { describe, it, expect, afterEach } from 'vitest';
import app from '../src/index';
import { clearAllClients } from '../src/sse/index';

describe('SSE Security & Private Room Access Control Tests', () => {
  afterEach(() => {
    clearAllClients();
  });

  it('should enforce private room authorization for GET /sse', async () => {
    // 1. Create a private room owned by 'owner-agent'
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Private SSE Lounge', isPrivate: true }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Requesting SSE connection to private room without agentId should fail (401)
    const acUnauth = new AbortController();
    const unauthRes = await app.request(`/sse?roomId=${room.id}`, {
      signal: acUnauth.signal,
    });
    expect(unauthRes.status).toBe(401);
    const unauthBody = await unauthRes.json();
    expect(unauthBody.error.code).toBe('UNAUTHORIZED');
    acUnauth.abort();

    // 3. Requesting SSE connection to private room as non-owner agent should fail (403)
    const acForbidden = new AbortController();
    const forbiddenRes = await app.request(`/sse?roomId=${room.id}&agentId=intruder-agent`, {
      signal: acForbidden.signal,
    });
    expect(forbiddenRes.status).toBe(403);
    const forbiddenBody = await forbiddenRes.json();
    expect(forbiddenBody.error.code).toBe('FORBIDDEN');
    acForbidden.abort();

    // 4. Requesting SSE connection to private room as room owner should succeed (200)
    const acOwner = new AbortController();
    const ownerRes = await app.request(`/sse?roomId=${room.id}&agentId=owner-agent`, {
      signal: acOwner.signal,
    });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.headers.get('content-type')).toContain('text/event-stream');
    acOwner.abort();
  });

  it('should allow any agent to connect to a public room SSE feed', async () => {
    // 1. Create a public room
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Public SSE Lounge', isPrivate: false }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Any agent should be able to connect to public room SSE
    const ac = new AbortController();
    const publicRes = await app.request(`/sse?roomId=${room.id}&agentId=visitor-agent`, {
      signal: ac.signal,
    });
    expect(publicRes.status).toBe(200);
    expect(publicRes.headers.get('content-type')).toContain('text/event-stream');
    ac.abort();
  });

  it('should prevent leaking private room messages to unauthorized global SSE clients while delivering to owner and public room listeners', async () => {
    const { broadcastToRoom } = await import('../src/sse/index');

    // 1. Create a private room owned by 'room-owner-agent'
    const createPrivRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'room-owner-agent',
      },
      body: JSON.stringify({ name: 'Confidential War Room', isPrivate: true }),
    });
    expect(createPrivRes.status).toBe(201);
    const { room: privRoom } = await createPrivRes.json();

    // 2. Create a public room
    const createPubRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'pub-creator-agent',
      },
      body: JSON.stringify({ name: 'Open Common Room', isPrivate: false }),
    });
    expect(createPubRes.status).toBe(201);
    const { room: pubRoom } = await createPubRes.json();

    // Helper collector
    class SseCollector {
      private events: any[] = [];
      private reader: ReadableStreamDefaultReader<Uint8Array>;
      private decoder = new TextDecoder();
      private buffer = '';

      constructor(stream: ReadableStream<Uint8Array>) {
        this.reader = stream.getReader();
        void this.readLoop();
      }

      private async readLoop() {
        try {
          while (true) {
            const { done, value } = await this.reader.read();
            if (done) break;
            this.buffer += this.decoder.decode(value, { stream: true });
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  this.events.push(JSON.parse(line.slice(6)));
                } catch {
                  // ignore non-json
                }
              }
            }
          }
        } catch {
          // stream aborted
        }
      }

      async waitForEvent(predicate: (e: any) => boolean, timeoutMs = 2000): Promise<any> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const found = this.events.find(predicate);
          if (found) return found;
          await new Promise((r) => setTimeout(r, 20));
        }
        return undefined;
      }

      getEvents() {
        return this.events;
      }
    }

    // Connect unauthorized global client
    const acIntruder = new AbortController();
    const intruderRes = await app.request('/sse?agentId=intruder-global', {
      signal: acIntruder.signal,
    });
    const intruderCollector = new SseCollector(intruderRes.body!);
    await intruderCollector.waitForEvent((e) => e.type === 'system');

    // Connect authorized global client (room-owner-agent)
    const acOwner = new AbortController();
    const ownerRes = await app.request('/sse?agentId=room-owner-agent', {
      signal: acOwner.signal,
    });
    const ownerCollector = new SseCollector(ownerRes.body!);
    await ownerCollector.waitForEvent((e) => e.type === 'system');

    // Broadcast message to private room
    broadcastToRoom({
      roomId: privRoom.id,
      agentId: 'room-owner-agent',
      message: 'Top secret private strategy',
      timestamp: Date.now(),
    });

    // Owner global client SHOULD receive the private room event
    const ownerReceived = await ownerCollector.waitForEvent(
      (e) => e.message === 'Top secret private strategy',
    );
    expect(ownerReceived).toBeDefined();

    // Intruder global client MUST NOT receive the private room event
    await new Promise((r) => setTimeout(r, 100));
    const leaked = intruderCollector
      .getEvents()
      .find((e) => e.message === 'Top secret private strategy');
    expect(leaked).toBeUndefined();

    // Broadcast message to public room
    broadcastToRoom({
      roomId: pubRoom.id,
      agentId: 'pub-creator-agent',
      message: 'Hello everyone in public room',
      timestamp: Date.now(),
    });

    // Both global clients SHOULD receive the public room event
    const intruderPubReceived = await intruderCollector.waitForEvent(
      (e) => e.message === 'Hello everyone in public room',
    );
    expect(intruderPubReceived).toBeDefined();

    acIntruder.abort();
    acOwner.abort();
  });
});
