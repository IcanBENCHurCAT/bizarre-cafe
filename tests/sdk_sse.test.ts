import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentClient,
  type AgentClientRetryConfig,
} from '../packages/sdk/src/index';

// Create a mock EventSource class to control connection events deterministically
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  simulateOpen() {
    if (this.onopen && !this.closed) {
      this.onopen();
    }
  }

  simulateMessage(data: unknown) {
    if (this.onmessage && !this.closed) {
      this.onmessage({
        data: typeof data === 'string' ? data : JSON.stringify(data),
      });
    }
  }

  simulateError(err?: unknown) {
    if (this.onerror && !this.closed) {
      this.onerror(err || new Error('Connection failed'));
    }
  }
}

// Mock the eventsource package
vi.mock('eventsource', () => {
  return {
    EventSource: function (url: string) {
      return new MockEventSource(url);
    },
  };
});

describe('AgentClient SSE Reconnection & Typed Events (US3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should transition through connection states: disconnected -> connecting -> connected', () => {
    const client = new AgentClient({
      baseUrl: 'http://localhost:3000',
      agentId: 'agent-alice',
    });

    expect(client.sseConnectionState).toBe('disconnected');

    const connectingSpy = vi.fn();
    const connectedSpy = vi.fn();
    client.on('connecting', connectingSpy);
    client.on('connected', connectedSpy);

    client.connectSse({ roomId: 'room-alpha' });

    expect(client.sseConnectionState).toBe('connecting');
    expect(connectingSpy).toHaveBeenCalledTimes(1);
    expect(connectedSpy).not.toHaveBeenCalled();

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    expect(es.url).toBe('http://localhost:3000/sse?agentId=agent-alice&roomId=room-alpha');

    // Simulate connection open
    es.simulateOpen();

    expect(client.sseConnectionState).toBe('connected');
    expect(connectedSpy).toHaveBeenCalledTimes(1);

    client.disconnectSse();
  });

  it('should dispatch typed events: chat, presence, heartbeat, system, room_update and raw message', () => {
    const client = new AgentClient({
      baseUrl: 'http://localhost:3000',
      agentId: 'agent-bob',
    });

    const chatSpy = vi.fn();
    const presenceSpy = vi.fn();
    const heartbeatSpy = vi.fn();
    const systemSpy = vi.fn();
    const roomUpdateSpy = vi.fn();
    const messageSpy = vi.fn();

    client.on('chat', chatSpy);
    client.on('presence', presenceSpy);
    client.on('heartbeat', heartbeatSpy);
    client.on('system', systemSpy);
    client.on('room_update', roomUpdateSpy);
    client.on('message', messageSpy);

    client.connectSse();
    const es = MockEventSource.instances[0];
    es.simulateOpen();

    // 1. Chat event
    const chatPayload = {
      type: 'chat',
      roomId: 'room-1',
      agentId: 'agent-alice',
      message: 'Hello from Alice!',
      timestamp: 1700000001000,
    };
    es.simulateMessage(chatPayload);
    expect(chatSpy).toHaveBeenCalledWith(chatPayload);
    expect(messageSpy).toHaveBeenCalledWith(chatPayload);

    // 2. Presence event (join)
    const joinPayload = {
      type: 'join',
      roomId: 'room-1',
      agentId: 'agent-charlie',
      status: 'active',
      timestamp: 1700000002000,
    };
    es.simulateMessage(joinPayload);
    expect(presenceSpy).toHaveBeenCalledWith(joinPayload);

    // 3. Heartbeat event
    const heartbeatPayload = {
      type: 'heartbeat',
      ts: 1700000003000,
      timestamp: 1700000003000,
    };
    es.simulateMessage(heartbeatPayload);
    expect(heartbeatSpy).toHaveBeenCalledWith(heartbeatPayload);

    // 4. System event
    const systemPayload = {
      type: 'system',
      message: 'Client connected',
      clientId: 'session-123',
    };
    es.simulateMessage(systemPayload);
    expect(systemSpy).toHaveBeenCalledWith(systemPayload);

    // 5. Room update event
    const roomUpdatePayload = {
      type: 'room_update',
      roomId: 'room-1',
      topic: 'Temporal Mechanics',
    };
    es.simulateMessage(roomUpdatePayload);
    expect(roomUpdateSpy).toHaveBeenCalledWith(roomUpdatePayload);

    client.disconnectSse();
  });

  it('should automatically attempt reconnection with exponential backoff and jitter on stream error', () => {
    const retryConfig: AgentClientRetryConfig = {
      autoReconnect: true,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      maxRetries: 3,
      jitter: 0.1, // +/- 10%
    };

    const client = new AgentClient({
      baseUrl: 'http://localhost:3000',
      agentId: 'agent-charlie',
    });

    const reconnectingSpy = vi.fn();
    const errorSpy = vi.fn();
    client.on('reconnecting', reconnectingSpy);
    client.on('error', errorSpy);

    client.connectSse({ roomId: 'room-lounge', retryConfig });
    const es1 = MockEventSource.instances[0];
    es1.simulateOpen();
    expect(client.sseConnectionState).toBe('connected');

    // Unexpected stream error on es1
    es1.simulateError(new Error('Connection terminated'));

    expect(client.sseConnectionState).toBe('reconnecting');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(reconnectingSpy).toHaveBeenCalledTimes(1);

    // Check retry attempt 1 delay
    const [attempt1, delay1] = reconnectingSpy.mock.calls[0];
    expect(attempt1).toBe(1);
    // Base is 1000 * 2^0 = 1000. With 10% jitter: between 900 and 1100
    expect(delay1).toBeGreaterThanOrEqual(899);
    expect(delay1).toBeLessThanOrEqual(1101);

    // Advance time to trigger reconnect attempt 1
    vi.advanceTimersByTime(delay1);

    expect(MockEventSource.instances.length).toBe(2);
    const es2 = MockEventSource.instances[1];
    expect(es2.url).toBe('http://localhost:3000/sse?agentId=agent-charlie&roomId=room-lounge');

    // Simulate another error on es2
    es2.simulateError(new Error('Still down'));
    expect(reconnectingSpy).toHaveBeenCalledTimes(2);
    const [attempt2, delay2] = reconnectingSpy.mock.calls[1];
    expect(attempt2).toBe(2);
    // Base is 1000 * 2^1 = 2000. With 10% jitter: between 1800 and 2200
    expect(delay2).toBeGreaterThanOrEqual(1799);
    expect(delay2).toBeLessThanOrEqual(2201);

    client.disconnectSse();
  });

  it('should transition to disconnected when maxRetries is exceeded', () => {
    const client = new AgentClient({
      baseUrl: 'http://localhost:3000',
      agentId: 'agent-max-retry',
    });

    const disconnectedSpy = vi.fn();
    const reconnectingSpy = vi.fn();
    client.on('disconnected', disconnectedSpy);
    client.on('reconnecting', reconnectingSpy);
    client.on('error', vi.fn());

    client.connectSse({
      retryConfig: {
        autoReconnect: true,
        initialDelayMs: 100,
        maxRetries: 2,
        jitter: 0,
      },
    });

    const es1 = MockEventSource.instances[0];
    es1.simulateOpen();

    // 1st error -> retry 1
    es1.simulateError(new Error('Drop 1'));
    expect(reconnectingSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);

    // 2nd error -> retry 2
    const es2 = MockEventSource.instances[1];
    es2.simulateError(new Error('Drop 2'));
    expect(reconnectingSpy).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(200);

    // 3rd error -> maxRetries (2) exceeded, transitions to disconnected
    const es3 = MockEventSource.instances[2];
    es3.simulateError(new Error('Drop 3'));

    expect(client.sseConnectionState).toBe('disconnected');
    expect(disconnectedSpy).toHaveBeenCalledWith('max retries reached');
  });

  it('should suppress reconnection and close stream on disconnectSse()', () => {
    const client = new AgentClient({
      baseUrl: 'http://localhost:3000',
      agentId: 'agent-clean-exit',
    });

    const disconnectedSpy = vi.fn();
    client.on('disconnected', disconnectedSpy);

    client.connectSse({
      retryConfig: {
        autoReconnect: true,
        initialDelayMs: 500,
      },
    });

    const es = MockEventSource.instances[0];
    es.simulateOpen();
    expect(client.sseConnectionState).toBe('connected');

    // Clean disconnect
    client.disconnectSse();

    expect(es.closed).toBe(true);
    expect(client.sseConnectionState).toBe('disconnected');
    expect(disconnectedSpy).toHaveBeenCalledWith('client disconnected');

    // Advancing timers should not spawn any new EventSource
    vi.advanceTimersByTime(5000);
    expect(MockEventSource.instances.length).toBe(1);
  });
});
