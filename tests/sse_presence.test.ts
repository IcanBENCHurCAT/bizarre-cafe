import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/index';
import {
  clearAllClients,
  getRoomPresence,
  getRoomAgents,
  updateClientRoom,
  getConnectedClients,
  touchAgent,
} from '../src/sse/index';

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
      // Stream aborted
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

describe('SSE Presence & Lifecycle Broadcasts Integration Tests', () => {
  const abortControllers: AbortController[] = [];
  const collectors: SseEventCollector[] = [];

  beforeEach(() => {
    clearAllClients();
  });

  afterEach(() => {
    for (const c of collectors) c.stop();
    collectors.length = 0;
    for (const ac of abortControllers) ac.abort();
    abortControllers.length = 0;
    clearAllClients();
  });

  it('should broadcast join event to room participants when a client connects to a room', async () => {
    const acAlice = new AbortController();
    abortControllers.push(acAlice);

    // Alice connects to room-alpha first
    const resAlice = await app.request('/sse?agentId=alice&roomId=room-alpha', {
      signal: acAlice.signal,
    });
    const colAlice = new SseEventCollector(resAlice.body!);
    collectors.push(colAlice);
    await colAlice.waitForEvent((e) => e.type === 'system');

    // Bob connects to room-alpha
    const acBob = new AbortController();
    abortControllers.push(acBob);
    const resBob = await app.request('/sse?agentId=bob&roomId=room-alpha', {
      signal: acBob.signal,
    });
    const colBob = new SseEventCollector(resBob.body!);
    collectors.push(colBob);
    await colBob.waitForEvent((e) => e.type === 'system');

    // Alice should receive Bob's join event
    const joinEvent = await colAlice.waitForEvent(
      (e) => e.type === 'join' && e.agentId === 'bob' && (e.roomId === 'room-alpha' || e.room === 'room-alpha'),
    );
    expect(joinEvent).toBeDefined();
    expect(joinEvent.agentId).toBe('bob');
  });

  it('should broadcast leave event to room when client disconnects', async () => {
    const acAlice = new AbortController();
    const acBob = new AbortController();
    abortControllers.push(acAlice, acBob);

    // Alice connects to room-beta
    const resAlice = await app.request('/sse?agentId=alice&roomId=room-beta', {
      signal: acAlice.signal,
    });
    const colAlice = new SseEventCollector(resAlice.body!);
    collectors.push(colAlice);
    await colAlice.waitForEvent((e) => e.type === 'system');

    // Bob connects to room-beta
    const resBob = await app.request('/sse?agentId=bob&roomId=room-beta', {
      signal: acBob.signal,
    });
    const colBob = new SseEventCollector(resBob.body!);
    collectors.push(colBob);
    await colBob.waitForEvent((e) => e.type === 'system');

    // Bob disconnects (abort)
    acBob.abort();

    // Alice should receive Bob's leave event
    const leaveEvent = await colAlice.waitForEvent(
      (e) => e.type === 'leave' && e.agentId === 'bob' && (e.roomId === 'room-beta' || e.room === 'room-beta'),
    );
    expect(leaveEvent).toBeDefined();
    expect(leaveEvent.agentId).toBe('bob');
  });

  it('should return live active presence snapshot via GET /api/chat/presence', async () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    abortControllers.push(ac1, ac2);

    await app.request('/sse?agentId=agent-active-1&roomId=room-pres-1', { signal: ac1.signal });
    await app.request('/sse?agentId=agent-active-2&roomId=room-pres-1', { signal: ac2.signal });

    const res = await app.request('/api/chat/presence?roomId=room-pres-1', {
      headers: {
        'X-Agent-ID': 'test-query-agent',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roomId).toBe('room-pres-1');
    expect(Array.isArray(body.presence)).toBe(true);
    expect(body.presence.length).toBe(2);

    const agent1 = body.presence.find((p: any) => p.agentId === 'agent-active-1');
    const agent2 = body.presence.find((p: any) => p.agentId === 'agent-active-2');

    expect(agent1).toBeDefined();
    expect(agent1.status).toBe('active');
    expect(agent2).toBeDefined();
    expect(agent2.status).toBe('active');
    expect(new Date(agent1.lastSeen).getTime()).toBeGreaterThan(0);
  });

  it('should report idle status when client lastSeen is older than 60 seconds', async () => {
    const ac = new AbortController();
    abortControllers.push(ac);

    await app.request('/sse?agentId=agent-idle&roomId=room-idle-test', { signal: ac.signal });

    // Manually age the client's lastSeen timestamp to simulate idle
    const clients = getConnectedClients();
    const idleClient = clients.find((c) => c.agentId === 'agent-idle');
    expect(idleClient).toBeDefined();
    (idleClient as any).lastSeen = Date.now() - 75000; // 75 seconds ago

    const res = await app.request('/api/chat/presence?roomId=room-idle-test', {
      headers: {
        'X-Agent-ID': 'test-query-agent',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const presenceEntry = body.presence.find((p: any) => p.agentId === 'agent-idle');
    expect(presenceEntry).toBeDefined();
    expect(presenceEntry.status).toBe('idle');
  });

  it('should refresh lastSeen on sender when sending a message and transition idle back to active', async () => {
    const ac = new AbortController();
    abortControllers.push(ac);

    await app.request('/sse?agentId=agent-sender&roomId=room-refresh-test', { signal: ac.signal });

    // Age client
    const clients = getConnectedClients();
    const client = clients.find((c) => c.agentId === 'agent-sender');
    expect(client).toBeDefined();
    (client as any).lastSeen = Date.now() - 90000;

    // Verify it is idle
    let pres = getRoomPresence('room-refresh-test');
    expect(pres.find((p) => p.agentId === 'agent-sender')?.status).toBe('idle');

    // Post a message as agent-sender (supports non-uuid roomId)
    const postRes = await app.request('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'agent-sender',
      },
      body: JSON.stringify({
        roomId: 'room-refresh-test',
        content: 'I am back and active!',
      }),
    });

    expect(postRes.status).toBe(201);

    // Pres should now be active
    pres = getRoomPresence('room-refresh-test');
    const updated = pres.find((p) => p.agentId === 'agent-sender');
    expect(updated?.status).toBe('active');
    expect(Date.now() - new Date(updated!.lastSeen).getTime()).toBeLessThan(2000);
  });

  it('should return live agent roster via GET /api/rooms/:roomId/agents', async () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    abortControllers.push(ac1, ac2);

    await app.request('/sse?agentId=roster-alice&roomId=room-roster', { signal: ac1.signal });
    await app.request('/sse?agentId=roster-bob&roomId=room-roster', { signal: ac2.signal });

    const res = await app.request('/api/rooms/room-roster/agents', {
      headers: {
        'X-Agent-ID': 'test-agent',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roomId).toBe('room-roster');
    expect(body.agents).toContain('roster-alice');
    expect(body.agents).toContain('roster-bob');
    expect(body.agents.length).toBe(2);
  });

  it('should move client room and broadcast lifecycle events on updateClientRoom', async () => {
    const acListenerOld = new AbortController();
    const acListenerNew = new AbortController();
    const acHopper = new AbortController();
    abortControllers.push(acListenerOld, acListenerNew, acHopper);

    // Old room listener
    const resOld = await app.request('/sse?agentId=listener-old&roomId=room-hop-old', {
      signal: acListenerOld.signal,
    });
    const colOld = new SseEventCollector(resOld.body!);
    collectors.push(colOld);
    await colOld.waitForEvent((e) => e.type === 'system');

    // New room listener
    const resNew = await app.request('/sse?agentId=listener-new&roomId=room-hop-new', {
      signal: acListenerNew.signal,
    });
    const colNew = new SseEventCollector(resNew.body!);
    collectors.push(colNew);
    await colNew.waitForEvent((e) => e.type === 'system');

    // Hopper agent connects to old room
    await app.request('/sse?agentId=hopper-agent&roomId=room-hop-old', { signal: acHopper.signal });

    expect(getRoomAgents('room-hop-old')).toContain('hopper-agent');
    expect(getRoomAgents('room-hop-new')).not.toContain('hopper-agent');

    // Hopper joins new room via POST /api/rooms/:roomId/join
    const joinRes = await app.request('/api/rooms/room-hop-new/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'hopper-agent',
      },
      body: JSON.stringify({ roomId: 'room-hop-new' }),
    });
    expect(joinRes.status).toBe(200);

    // Old room listener receives leave event
    const leaveEvent = await colOld.waitForEvent(
      (e) => e.type === 'leave' && e.agentId === 'hopper-agent' && (e.roomId === 'room-hop-old' || e.room === 'room-hop-old'),
    );
    expect(leaveEvent).toBeDefined();

    // New room listener receives join event
    const joinEvent = await colNew.waitForEvent(
      (e) => e.type === 'join' && e.agentId === 'hopper-agent' && (e.roomId === 'room-hop-new' || e.room === 'room-hop-new'),
    );
    expect(joinEvent).toBeDefined();

    // In-memory roster updated
    expect(getRoomAgents('room-hop-old')).not.toContain('hopper-agent');
    expect(getRoomAgents('room-hop-new')).toContain('hopper-agent');
  });

  it('should move client to global and broadcast leave on POST /api/rooms/:roomId/leave', async () => {
    const acListener = new AbortController();
    const acLeaver = new AbortController();
    abortControllers.push(acListener, acLeaver);

    const resListener = await app.request('/sse?agentId=room-watcher&roomId=room-leave-test', {
      signal: acListener.signal,
    });
    const colListener = new SseEventCollector(resListener.body!);
    collectors.push(colListener);
    await colListener.waitForEvent((e) => e.type === 'system');

    await app.request('/sse?agentId=leaver-agent&roomId=room-leave-test', {
      signal: acLeaver.signal,
    });
    expect(getRoomAgents('room-leave-test')).toContain('leaver-agent');

    // Call leave endpoint
    const leaveRes = await app.request('/api/rooms/room-leave-test/leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'leaver-agent',
      },
    });
    expect(leaveRes.status).toBe(200);

    // Watcher receives leave event
    const leaveEv = await colListener.waitForEvent(
      (e) => e.type === 'leave' && e.agentId === 'leaver-agent',
    );
    expect(leaveEv).toBeDefined();

    expect(getRoomAgents('room-leave-test')).not.toContain('leaver-agent');
  });

  it('should return 400 VALIDATION_ERROR if roomId query param is missing in GET /presence', async () => {
    const res = await app.request('/api/chat/presence', {
      headers: {
        'X-Agent-ID': 'test-agent',
      },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
