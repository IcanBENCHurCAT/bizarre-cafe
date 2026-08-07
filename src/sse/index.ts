import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { config } from '../config';

export interface SseClient {
  id: string;
  agentId: string;
  roomId: string | null;
  active: boolean;
  lastSeen: number;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  stream: any;
}

export interface SseMessage {
  type: 'chat' | 'join' | 'leave' | 'typing' | 'ping' | 'pong';
  roomId?: string;
  content?: string;
  agentId?: string;
  timestamp?: number;
}

export interface SseEvent {
  type: 'chat' | 'system' | 'heartbeat' | 'room_update' | 'error';
  roomId?: string;
  data: Record<string, unknown>;
  retry?: number;
}

export interface BroadcastPayload {
  roomId: string | null;
  agentId: string;
  message: string;
  timestamp: number;
}

const clients = new Map<string, SseClient>();
const roomClients = new Map<string, Set<string>>(); // O(1) index for clients in a specific room
const globalClients = new Set<string>(); // O(1) index for clients not in any specific room
const agentClients = new Map<string, Set<string>>(); // O(1) index for finding a client by agentId
const handlers = new Map<string, (client: SseClient, message: SseMessage) => Promise<void>>();
const interceptors: Array<(payload: BroadcastPayload) => BroadcastPayload> = [];

const generateId = (): string => crypto.randomUUID();

const formatMessage = (payload: BroadcastPayload): BroadcastPayload => {
  let result = { ...payload };
  for (const interceptor of interceptors) result = interceptor(result);
  return result;
};

const sendSerializedToClient = (client: SseClient, serializedData: string): boolean => {
  if (!client.active) return false;
  try {
    console.log(`[BACKEND SSE]: Sending to ${client.id} (agent ${client.agentId}):`, serializedData);
    client.stream.writeSSE({ data: serializedData });
    return true;
  } catch (e) {
    console.error(`[BACKEND SSE ERROR]:`, e);
    client.active = false;
    return false;
  }
};

const sendToClient = (client: SseClient, event: SseEvent): boolean => {
  if (!client.active) return false;
  const serialized = JSON.stringify({
    type: event.type as any,
    room: event.roomId,
    ...event.data,
  });
  return sendSerializedToClient(client, serialized);
};

export const broadcastToRoom = (payload: BroadcastPayload): void => {
  const formatted = formatMessage(payload);
  console.log(
    `[BACKEND SSE]: broadcastToRoom called for room ${formatted.roomId}. Active clients: ${clients.size}`,
  );

  // ⚡ Bolt Optimization: Serialize once, broadcast to many. O(N) -> O(1) serialization overhead
  const serializedEvent = JSON.stringify({
    type: 'chat',
    room: formatted.roomId || undefined,
    agentId: formatted.agentId,
    message: formatted.message,
    timestamp: formatted.timestamp,
  });

  const sendToTarget = (clientId: string) => {
    const client = clients.get(clientId);
    if (!client || !client.active) return;

    console.log(`[BACKEND SSE]: Checking client ${client.id} in room ${client.roomId}`);
    sendSerializedToClient(client, serializedEvent);
  };

  // Send to all global clients (roomId === null)
  for (const clientId of globalClients) {
    sendToTarget(clientId);
  }

  // Send to clients in the specific room
  if (formatted.roomId && roomClients.has(formatted.roomId)) {
    for (const clientId of roomClients.get(formatted.roomId)!) {
      sendToTarget(clientId);
    }
  }
};

const cleanupClient = (clientId: string): void => {
  const client = clients.get(clientId);
  if (!client) return;
  client.active = false;
  if (client.heartbeatTimer) clearInterval(client.heartbeatTimer);

  // Remove from roomClients index
  if (client.roomId) {
    const roomSet = roomClients.get(client.roomId);
    if (roomSet) {
      roomSet.delete(clientId);
      if (roomSet.size === 0) roomClients.delete(client.roomId);
    }
  } else {
    globalClients.delete(clientId);
  }

  // Remove from agentClients index
  const agentSet = agentClients.get(client.agentId);
  if (agentSet) {
    agentSet.delete(clientId);
    if (agentSet.size === 0) agentClients.delete(client.agentId);
  }

  clients.delete(clientId);
  console.info(`[sse] Client ${clientId} (agent ${client.agentId}) disconnected`);
};

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
const startHeartbeats = (): void => {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    // ⚡ Bolt Optimization: Serialize heartbeat payload once for all clients
    const serializedHeartbeat = JSON.stringify({ type: 'heartbeat', ts: now });

    for (const client of clients.values()) {
      if (!client.active) {
        cleanupClient(client.id);
        continue;
      }
      sendSerializedToClient(client, serializedHeartbeat);
    }
  }, config.sseHeartbeatMs);
};

export const sseHandler = async (c: Context) => {
  const agentId = c.req.header('x-agent-id') ?? c.req.header('X-Agent-ID') ?? 'anonymous';
  const roomId = c.req.header('x-room-id');
  const clientId = generateId();

  return streamSSE(c, async (stream) => {
    startHeartbeats();
    const client: SseClient = {
      id: clientId,
      agentId,
      roomId: roomId || null,
      active: true,
      lastSeen: Date.now(),
      heartbeatTimer: null,
      stream,
    };
    clients.set(clientId, client);

    // Add to room index
    if (client.roomId) {
      if (!roomClients.has(client.roomId)) {
        roomClients.set(client.roomId, new Set());
      }
      roomClients.get(client.roomId)!.add(clientId);
    } else {
      globalClients.add(clientId);
    }

    // Add to agent index
    if (!agentClients.has(agentId)) {
      agentClients.set(agentId, new Set());
    }
    agentClients.get(agentId)!.add(clientId);

    console.info(`[sse] Client ${clientId} connected (agent ${agentId}, room ${roomId || 'all'})`);

    await sendToClient(client, {
      type: 'system',
      data: { message: 'Connected to Bizarre Cafe SSE stream.', clientId, timestamp: Date.now() },
    });

    await new Promise<void>((resolve) => {
      c.req.raw.signal?.addEventListener('abort', () => {
        cleanupClient(clientId);
        resolve();
      });
    });
  });
};

export const registerHandler = (
  type: string,
  handler: (client: SseClient, message: SseMessage) => Promise<void>,
): void => {
  handlers.set(type, handler);
};

export const registerInterceptor = (
  interceptor: (payload: BroadcastPayload) => BroadcastPayload,
): void => {
  interceptors.push(interceptor);
};

export const parseMessage = (raw: string): SseMessage | undefined => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.type !== 'string') return undefined;
    return {
      type: parsed.type,
      roomId: parsed.roomId,
      content: parsed.content,
      agentId: parsed.agentId,
      timestamp: parsed.timestamp ?? Date.now(),
    };
  } catch {
    return undefined;
  }
};

export const processMessage = async (message: SseMessage): Promise<void> => {
  const handler = handlers.get(message.type);
  if (handler && message.agentId) {
    const agentSet = agentClients.get(message.agentId);
    if (agentSet) {
      for (const clientId of agentSet) {
        const client = clients.get(clientId);
        if (client && client.active) {
          await handler(client, message);
          return;
        }
      }
    }
  }
  if (message.type === 'chat' && message.content) {
    broadcastToRoom({
      roomId: message.roomId ?? null,
      agentId: message.agentId ?? 'anonymous',
      message: message.content,
      timestamp: message.timestamp ?? Date.now(),
    });
  }
};

export const getConnectedClients = (): ReadonlyArray<SseClient> => Array.from(clients.values());
export const getConnectedClientCount = (roomId?: string): number => clients.size;
export const getRoomState = (): Map<string, string[]> => {
  const roomMap = new Map<string, string[]>();
  for (const client of clients.values()) {
    if (!client.active) continue;
    const key = client.roomId ?? 'all';
    const existing = roomMap.get(key) ?? [];
    existing.push(client.id);
    roomMap.set(key, existing);
  }
  return roomMap;
};
