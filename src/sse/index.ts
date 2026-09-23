import { Context } from 'hono';
import { streamSSE, SSEStreamingApi } from 'hono/streaming';
import { config } from '../config';

export interface SseClient {
  id: string;
  agentId: string;
  roomId: string | null;
  active: boolean;
  lastSeen: number;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  stream: SSEStreamingApi;
}

export interface SseMessage {
  type: 'chat' | 'join' | 'leave' | 'typing' | 'ping' | 'pong';
  roomId?: string;
  content?: string;
  agentId?: string;
  timestamp?: number;
}

export interface SseEvent {
  type: 'chat' | 'system' | 'heartbeat' | 'room_update' | 'error' | 'join' | 'leave' | 'presence';
  roomId?: string;
  data: Record<string, unknown>;
  retry?: number;
}

export interface RoomParticipant {
  agentId: string;
  lastSeen: string;
  status: 'active' | 'idle';
}

export interface BroadcastPayload {
  type?: string;
  roomId: string | null;
  agentId: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
  participants?: RoomParticipant[];
  [key: string]: unknown;
}

const clients = new Map<string, SseClient>();
const roomClients = new Map<string, Set<string>>(); // O(1) index: roomId -> clientIds
const globalClients = new Set<string>(); // O(1) index: clientIds with roomId === null
const agentClients = new Map<string, Set<string>>(); // O(1) index: agentId -> clientIds
const handlers = new Map<string, (client: SseClient, message: SseMessage) => Promise<void>>();
const interceptors: Array<(payload: BroadcastPayload) => BroadcastPayload> = [];

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

const generateId = (): string => crypto.randomUUID();

const formatMessage = (payload: BroadcastPayload): BroadcastPayload => {
  let result = { ...payload };
  for (const interceptor of interceptors) result = interceptor(result);
  return result;
};

const sendSerializedToClient = (client: SseClient, serializedData: string): boolean => {
  if (!client.active) return false;
  try {
    const res = client.stream.writeSSE({ data: serializedData });
    if (res && typeof (res as any).catch === 'function') {
      (res as any).catch(() => {
        client.active = false;
        cleanupClient(client.id);
      });
    }
    return true;
  } catch {
    client.active = false;
    cleanupClient(client.id);
    return false;
  }
};

const sendToClient = (client: SseClient, event: SseEvent): boolean => {
  if (!client.active) return false;
  const serialized = JSON.stringify({
    type: event.type as any,
    room: event.roomId,
    roomId: event.roomId,
    ...event.data,
  });
  return sendSerializedToClient(client, serialized);
};

export const broadcastToRoom = (payload: BroadcastPayload): void => {
  const formatted = formatMessage(payload);
  const eventType = formatted.type || 'chat';

  // Single-point serialization: serialize once, send to multiple targets
  const serializedEvent = JSON.stringify({
    type: eventType,
    room: formatted.roomId ?? undefined,
    roomId: formatted.roomId ?? undefined,
    agentId: formatted.agentId,
    message: formatted.message,
    timestamp: formatted.timestamp,
    ...(formatted.data ? { data: formatted.data } : {}),
    ...(formatted.participants ? { participants: formatted.participants } : {}),
  });

  const sendToTarget = (clientId: string) => {
    const client = clients.get(clientId);
    if (!client || !client.active) return;
    sendSerializedToClient(client, serializedEvent);
  };

  if (formatted.roomId) {
    // Channel isolation: broadcast ONLY to room clients and global clients
    for (const clientId of globalClients) {
      sendToTarget(clientId);
    }
    const roomSet = roomClients.get(formatted.roomId);
    if (roomSet) {
      for (const clientId of roomSet) {
        sendToTarget(clientId);
      }
    }
  } else {
    // Global broadcast: broadcast to all active clients
    for (const client of clients.values()) {
      if (client.active) {
        sendSerializedToClient(client, serializedEvent);
      }
    }
  }
};

export const cleanupClient = (clientId: string): void => {
  const client = clients.get(clientId);
  if (!client) return;

  client.active = false;
  if (client.heartbeatTimer) {
    clearInterval(client.heartbeatTimer);
    client.heartbeatTimer = null;
  }

  const leavingRoomId = client.roomId;
  const leavingAgentId = client.agentId;

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

  // If all clients disconnected, clear the heartbeat timer to prevent leaks
  if (clients.size === 0 && heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Broadcast leave event to the room if client was registered to one
  if (leavingRoomId) {
    broadcastToRoom({
      type: 'leave',
      roomId: leavingRoomId,
      agentId: leavingAgentId,
      message: `${leavingAgentId} left the room`,
      timestamp: Date.now(),
    });
  }

  console.warn(`[sse] Client ${clientId} (agent ${leavingAgentId}) disconnected`);
};

export const triggerHeartbeat = (): void => {
  const now = Date.now();
  const serializedHeartbeat = JSON.stringify({
    type: 'heartbeat',
    ts: now,
    timestamp: now,
  });

  for (const client of clients.values()) { // ⚡ Bolt Optimization: Avoid O(N) memory allocation from Array.from()
    if (!client.active) {
      cleanupClient(client.id);
      continue;
    }
    sendSerializedToClient(client, serializedHeartbeat);
  }
};

export const startHeartbeats = (): void => {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    triggerHeartbeat();
  }, config.sseHeartbeatMs);
};

export const stopHeartbeats = (): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

export const sseHandler = async (c: Context) => {
  const queryAgentId = c.req.query('agentId');
  const headerAgentId = c.req.header('x-agent-id') ?? c.req.header('X-Agent-ID');
  const userAgentId = (c as any).user?.agentId;
  const agentId = queryAgentId || headerAgentId || userAgentId || 'anonymous';

  const queryRoomId = c.req.query('roomId');
  const headerRoomId = c.req.header('x-room-id') ?? c.req.header('X-Room-ID');
  const rawRoomId = queryRoomId || headerRoomId;
  const roomId = rawRoomId && rawRoomId !== 'global' ? rawRoomId : null;

  const clientId = generateId();

  return streamSSE(c, async (stream) => {
    startHeartbeats();
    const client: SseClient = {
      id: clientId,
      agentId,
      roomId,
      active: true,
      lastSeen: Date.now(),
      heartbeatTimer: null,
      stream,
    };
    clients.set(clientId, client);

    // Add to room index
    if (client.roomId) {
      let roomSet = roomClients.get(client.roomId);
      if (!roomSet) {
        roomSet = new Set();
        roomClients.set(client.roomId, roomSet);
      }
      roomSet.add(clientId);
    } else {
      globalClients.add(clientId);
    }

    // Add to agent index
    let agentSet = agentClients.get(agentId);
    if (!agentSet) {
      agentSet = new Set();
      agentClients.set(agentId, agentSet);
    }
    agentSet.add(clientId);

    console.warn(`[sse] Client ${clientId} connected (agent ${agentId}, room ${roomId || 'global'})`);

    await sendToClient(client, {
      type: 'system',
      data: { message: 'Connected to Bizarre Cafe SSE stream.', clientId, timestamp: Date.now() },
    });

    if (client.roomId) {
      broadcastToRoom({
        type: 'join',
        roomId: client.roomId,
        agentId: client.agentId,
        message: `${client.agentId} joined the room`,
        timestamp: Date.now(),
      });
    }

    await new Promise<void>((resolve) => {
      const handleAbort = () => {
        cleanupClient(clientId);
        resolve();
      };
      c.req.raw.signal?.addEventListener('abort', handleAbort);
      stream.onAbort(handleAbort);
    });
  });
};

export const touchAgent = (agentId: string): void => {
  const clientIds = agentClients.get(agentId);
  if (clientIds) {
    const now = Date.now();
    for (const id of clientIds) {
      const client = clients.get(id);
      if (client) client.lastSeen = now;
    }
  }
};

export const updateClientRoom = (agentId: string, newRoomId: string | null): void => {
  const clientIds = agentClients.get(agentId);
  const oldRooms = new Set<string>();

  if (clientIds && clientIds.size > 0) {
    for (const clientId of clientIds) {
      const client = clients.get(clientId);
      if (!client) continue;

      const oldRoomId = client.roomId;
      if (oldRoomId === newRoomId) continue;

      if (oldRoomId) {
        oldRooms.add(oldRoomId);
        const oldSet = roomClients.get(oldRoomId);
        if (oldSet) {
          oldSet.delete(clientId);
          if (oldSet.size === 0) roomClients.delete(oldRoomId);
        }
      } else {
        globalClients.delete(clientId);
      }

      client.roomId = newRoomId;

      if (newRoomId) {
        let newSet = roomClients.get(newRoomId);
        if (!newSet) {
          newSet = new Set();
          roomClients.set(newRoomId, newSet);
        }
        newSet.add(clientId);
      } else {
        globalClients.add(clientId);
      }
    }
  }

  const now = Date.now();
  // Broadcast to old room(s)
  for (const oldRoomId of oldRooms) {
    broadcastToRoom({
      type: 'leave',
      roomId: oldRoomId,
      agentId,
      message: `${agentId} left the room`,
      timestamp: now,
    });
    broadcastToRoom({
      type: 'room_update',
      roomId: oldRoomId,
      agentId,
      message: `${agentId} left room ${oldRoomId}`,
      timestamp: now,
    });
  }

  // Broadcast to new room
  if (newRoomId) {
    broadcastToRoom({
      type: 'join',
      roomId: newRoomId,
      agentId,
      message: `${agentId} joined the room`,
      timestamp: now,
    });
    broadcastToRoom({
      type: 'room_update',
      roomId: newRoomId,
      agentId,
      message: `${agentId} joined room ${newRoomId}`,
      timestamp: now,
    });
  }
};

export const getRoomPresence = (roomId: string): RoomParticipant[] => {
  const clientIds = roomClients.get(roomId);
  if (!clientIds || clientIds.size === 0) return [];

  const now = Date.now();
  const agentMap = new Map<string, { lastSeen: number; status: 'active' | 'idle' }>();

  for (const clientId of clientIds) {
    const client = clients.get(clientId);
    if (!client || !client.active) continue;

    const isRecent = (now - client.lastSeen) < 60000;
    const currentStatus: 'active' | 'idle' = isRecent ? 'active' : 'idle';
    const existing = agentMap.get(client.agentId);

    if (!existing || client.lastSeen > existing.lastSeen) {
      agentMap.set(client.agentId, {
        lastSeen: client.lastSeen,
        status: currentStatus,
      });
    }
  }

  // ⚡ Bolt Optimization: Avoid O(N) memory allocation from Array.from()
  const result = [];
  for (const [agentId, data] of agentMap.entries()) {
    result.push({
      agentId,
      lastSeen: new Date(data.lastSeen).toISOString(),
      status: data.status,
    });
  }
  return result;
};

export const getRoomAgents = (roomId: string): string[] => {
  const clientIds = roomClients.get(roomId);
  if (!clientIds || clientIds.size === 0) return [];

  const agentIds = new Set<string>();
  for (const clientId of clientIds) {
    const client = clients.get(clientId);
    if (client && client.active) {
      agentIds.add(client.agentId);
    }
  }
  return Array.from(agentIds);
};

export const clearAllClients = (): void => {
  stopHeartbeats();
  for (const client of clients.values()) {
    client.active = false;
    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
      client.heartbeatTimer = null;
    }
  }
  clients.clear();
  roomClients.clear();
  globalClients.clear();
  agentClients.clear();
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
    if (agentSet && agentSet.size > 0) {
      const promises: Promise<void>[] = [];
      for (const clientId of agentSet) {
        const client = clients.get(clientId);
        if (client && client.active) {
          promises.push(handler(client, message));
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
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

export const getConnectedClients = (): ReadonlyArray<SseClient> => Array.from(clients.values());
export const getConnectedClientCount = (_roomId?: string): number => {
  if (_roomId) {
    return roomClients.get(_roomId)?.size ?? 0;
  }
  return clients.size;
};

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
