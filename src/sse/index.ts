/**
 * SSE (Server-Sent Events) Handler
 *
 * Manages real-time chat connections via Server-Sent Events.
 * Provides:
 *  - Client connection lifecycle (connect, message, disconnect)
 *  - Heartbeat ping to keep connections alive
 *  - Message routing to appropriate room handlers
 *  - Subscription management for per-room event delivery
 *
 * Endpoint: GET /sse
 */

import { Context } from 'hono';
import { config } from '../config';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Represents a connected SSE client */
export interface SseClient {
  /** Unique client identifier */
  id: string;
  /** Agent/user that owns this connection */
  agentId: string;
  /** Room the client is listening to (null = all rooms) */
  roomId: string | null;
  /** The response stream for sending events */
  res: Response;
  /** Whether the client is actively listening */
  active: boolean;
  /** Last activity timestamp */
  lastSeen: number;
  /** Interval handle for heartbeat (nullable for cleanup) */
  heartbeatTimer: ReturnType<typeof setInterval> | null;
}

/** Parsed SSE message from client */
export interface SseMessage {
  /** Event type */
  type: 'chat' | 'join' | 'leave' | 'typing' | 'ping' | 'pong';
  /** Room identifier (if applicable) */
  roomId?: string;
  /** Message content */
  content?: string;
  /** Sender agent ID */
  agentId?: string;
  /** Optional timestamp */
  timestamp?: number;
}

/** Server-to-client SSE event */
export interface SseEvent {
  /** Event type */
  type: 'chat' | 'system' | 'heartbeat' | 'room_update' | 'error';
  /** Optional room this event belongs to */
  roomId?: string;
  /** Event payload */
  data: Record<string, unknown>;
  /** Optional retry interval in ms (default from config) */
  retry?: number;
}

/** Message sent by client to the server */
export interface ClientMessage {
  text: string;
  roomId?: string;
  agentId: string;
  timestamp: number;
}

/** Internal broadcast payload for room fan-out */
export interface BroadcastPayload {
  roomId: string | null;
  agentId: string;
  message: string;
  timestamp: number;
}

// ──────────────────────────────────────────────
// Module State
// ──────────────────────────────────────────────

/** Registered SSE client connections, keyed by client ID */
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

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Generate a unique client ID for SSE connections.
 * Uses crypto.randomUUID when available.
 */
const generateId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for environments without crypto
    return `sse_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
};

/**
 * Format a chat message for SSE delivery.
 * Applies available interceptors and returns a clean payload.
 */
const formatMessage = (payload: BroadcastPayload): BroadcastPayload => {
  let result = { ...payload };
  for (const interceptor of interceptors) {
    result = interceptor(result);
  }
  return result;
};

/**
 * Send a data event to a single client.
 * Silently ignores errors from disconnected clients.
 */
const sendToClient = (client: SseClient, event: SseEvent): boolean => {
  if (!client.active) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = (client.res as any).getWriter?.() as
      | ReadableStreamDefaultWriter<string>
      | undefined;
    if (writer) {
      const serialized = JSON.stringify({
        type: event.type,
        room: event.roomId,
        ...event.data,
      });
      writer.write(`data: ${serialized}\n\n`);
      return true;
    }
  } catch {
    // Client likely disconnected
    client.active = false;
    return false;
  }

  // If no writer available, store for later
  // This is a simplified approach — production code might buffer
  return false;
};

/**
 * Broadcast a message to all clients in a room (or all clients if room is null).
 * Applies message formatting and delivers via available writers.
 */
const broadcastToRoom = (payload: BroadcastPayload): void => {
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

/**
 * Send a heartbeat ping to a specific client.
 */
const sendHeartbeat = (client: SseClient): void => {
  sendToClient(client, {
    type: 'heartbeat',
    data: { ts: Date.now() },
  });
};

/**
 * Clean up a disconnected client.
 */
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

  // eslint-disable-next-line no-console
  console.info(
    `[sse] Client ${clientId} (agent ${client.agentId}) disconnected`
  );
};

/**
 * Start the periodic heartbeat for all connected clients.
 * Runs independently and respects config.sseHeartbeatMs.
 */
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

      // Evict stale clients (no heartbeat received within 2x the interval)
      if (now - client.lastSeen > config.sseHeartbeatMs * 2) {
        cleanupClient(client.id);
      }
    }
  }, config.sseHeartbeatMs);
};

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * SSE request handler.
 *
 * Sets up the SSE stream, starts the heartbeat, and waits for
 * client disconnect. Sends a welcome message on connection.
 *
 * @param c — Hono Context with SSE-compatible Response
 * @returns void (the SSE stream runs until disconnect)
 */
export const sseHandler = async (c: Context): Promise<void> => {
  // Set SSE headers
  c.res = new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });

  // Ensure heartbeat is running globally
  startHeartbeats();

  // Register this client
  const agentId =
    c.req.header('x-agent-id') ?? c.req.header('X-Agent-ID') ?? 'anonymous';
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

  // Attach cleanup handler for response abort
  c.req.raw.signal?.addEventListener(
    'abort',
    () => {
      cleanupClient(clientId);
    },
    { once: true }
  );

  // Wait until the connection is closed (no event loop needed — Hono streams)
  await new Promise<void>((resolve) => {
    // On most platforms, the response signal fires on disconnect
    const signal = c.req.raw.signal;
    if (signal) {
      signal.addEventListener('abort', () => resolve(), { once: true });
    }
    // Safety timeout in case the abort signal never fires
    setTimeout(() => resolve(), config.sseTimeoutMs);
  });

  cleanupClient(clientId);
};

/**
 * Register a handler for a specific event type.
 * Handlers receive the client and a parsed message, and are
 * called whenever a message of that type is received from a client.
 *
 * @param type - Event type (e.g. 'chat', 'join', 'leave')
 * @param handler - Async callback
 */
export const registerHandler = (
  type: string,
  handler: (client: SseClient, message: SseMessage) => Promise<void>
): void => {
  handlers.set(type, handler);
};

/**
 * Register a message interceptor.
 * Interceptors run before any message is delivered and may
 * modify the payload. They run in registration order.
 *
 * @param interceptor - Function that receives and returns a BroadcastPayload
 */
export const registerInterceptor = (
  interceptor: (payload: BroadcastPayload) => BroadcastPayload
): void => {
  interceptors.push(interceptor);
};

/**
 * Parse a raw SSE message string into a structured SseMessage.
 *
 * @param raw - Raw message string from the client
 * @returns Parsed message or undefined if parsing fails
 */
export const parseMessage = (raw: string): SseMessage | undefined => {
  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed.type !== 'string') {
      return undefined;
    }

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

/**
 * Process an incoming client message and route it to the
 * appropriate handler or broadcast it to the room.
 *
 * @param message - Parsed SSE message
 */
export const processMessage = async (message: SseMessage): Promise<void> => {
  const handler = handlers.get(message.type);
  if (handler) {
    // Find the client associated with this message
    for (const client of clients.values()) {
      if (client.agentId === message.agentId && client.active) {
        await handler(client, message);
        return;
      }
    }
  }

  // Default: broadcast chat messages to the room
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
