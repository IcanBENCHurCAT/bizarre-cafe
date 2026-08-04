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

/** Clients grouped by room ID for faster broadcasting */
const roomClients = new Map<string | null, Set<SseClient>>();

/** Registered handlers for specific event types */
const handlers = new Map<
  string,
  (client: SseClient, message: SseMessage) => Promise<void>
>();

/** Global message interceptor — runs before delivery */
const interceptors: Array<(payload: BroadcastPayload) => BroadcastPayload> = [];

const generateId = (): string => crypto.randomUUID();

const formatMessage = (payload: BroadcastPayload): BroadcastPayload => {
  let result = { ...payload };
  for (const interceptor of interceptors) result = interceptor(result);
  return result;
};

const sendToClient = (client: SseClient, event: SseEvent): boolean => {
  if (!client.active) return false;
  try {
    const serialized = JSON.stringify({
      type: event.type,
      room: event.roomId,
      ...event.data,
    });
    console.log(`[BACKEND SSE]: Sending to ${client.id} (agent ${client.agentId}):`, serialized);
    client.stream.writeSSE({ data: serialized });
    return true;
  } catch (e) {
    console.error(`[BACKEND SSE ERROR]:`, e);
    client.active = false;
    return false;
  }
};

export const broadcastToRoom = (payload: BroadcastPayload): void => {
  const formatted = formatMessage(payload);

  const event: SseEvent = {
    type: 'chat',
    roomId: formatted.roomId || undefined,
    data: {
      agentId: formatted.agentId,
      message: formatted.message,
      timestamp: formatted.timestamp,
    },
  };

  // Send to clients explicitly in this room
  if (formatted.roomId !== null) {
    const specificRoomClients = roomClients.get(formatted.roomId);
    if (specificRoomClients) {
      for (const client of specificRoomClients) {
        if (client.active) sendToClient(client, event);
      }
    }
  }

  // Send to all-room listeners
  const allRoomClients = roomClients.get(null);
  if (allRoomClients) {
    for (const client of allRoomClients) {
      if (client.active) sendToClient(client, event);
    }
  }
};

const sendHeartbeat = (client: SseClient): void => {
  sendToClient(client, { type: 'heartbeat', data: { ts: Date.now() } });
};

const cleanupClient = (clientId: string): void => {
  const client = clients.get(clientId);
  if (!client) return;
  client.active = false;

  if (client.heartbeatTimer) {
    clearInterval(client.heartbeatTimer);
    client.heartbeatTimer = null;
  }

  // Remove from room index
  const roomSet = roomClients.get(client.roomId);
  if (roomSet) {
    roomSet.delete(client);
    if (roomSet.size === 0) {
      roomClients.delete(client.roomId);
    }
  }

  clients.delete(clientId);
  console.info(`[sse] Client ${clientId} (agent ${client.agentId}) disconnected`);
};

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
const startHeartbeats = (): void => {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const client of clients.values()) {
      if (!client.active) {
        cleanupClient(client.id);
        continue;
      }
      sendHeartbeat(client);
    }
  }, config.sseHeartbeatMs);
};

export const sseHandler = async (c: Context) => {
  const agentId = c.req.header('x-agent-id') ?? c.req.header('X-Agent-ID') ?? 'anonymous';
  const roomId = c.req.header('x-room-id');
  const clientId = generateId();

  const client: SseClient = {
    id: clientId,
    agentId,
    roomId: roomId || null,
    res: c.res,
    active: true,
    lastSeen: Date.now(),
    heartbeatTimer: null,
  };

  clients.set(clientId, client);

  // Add to room index
  let roomSet = roomClients.get(client.roomId);
  if (!roomSet) {
    roomSet = new Set();
    roomClients.set(client.roomId, roomSet);
  }
  roomSet.add(client);

  // eslint-disable-next-line no-console
  console.info(
    `[sse] Client ${clientId} connected (agent ${agentId}, room ${roomId || 'all'})`
  );

  // Send welcome event
  sendToClient(client, {
    type: 'system',
    data: {
      message: 'Connected to Bizarre Cafe SSE stream.',
      clientId,
      timestamp: Date.now(),
    },
  });

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

export const registerHandler = (type: string, handler: (client: SseClient, message: SseMessage) => Promise<void>): void => {
  handlers.set(type, handler);
};

export const registerInterceptor = (interceptor: (payload: BroadcastPayload) => BroadcastPayload): void => {
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
  if (handler) {
    for (const client of clients.values()) {
      if (client.agentId === message.agentId && client.active) {
        await handler(client, message);
        return;
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

/**
 * Get the current list of connected clients.
 * Useful for diagnostics and admin endpoints.
 *
 * @returns Array of connected clients (read-only)
 */
export const getConnectedClients = (): ReadonlyArray<SseClient> => {
  return Array.from(clients.values());
};

/**
 * Get the count of connected clients, optionally filtered by room.
 *
 * @param roomId - Optional room ID to filter by
 * @returns Count of active clients
 */
export const getConnectedClientCount = (_roomId?: string): number => {
  return clients.size;
};

/**
 * Get the SSE room state (map of room → client IDs).
 *
 * @returns Map of room IDs to connected client IDs
 */
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
