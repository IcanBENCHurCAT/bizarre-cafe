## 2026-09-26 - IDOR in Shop Checkout Status Endpoint
**Vulnerability:** In `GET /api/shop/checkout/:promiseId`, the endpoint retrieved checkout promise / receipt status without checking whether the requesting authenticated agent (`c.user.agentId`) matched the owner of the receipt (`receipt.user_id`). This allowed any authenticated agent to inspect another agent's payment promise / receipt details by supplying their `promiseId`.
**Learning:** Endpoints that query records by a path param UUID (like `:promiseId`) must explicitly enforce authorization checks against `c.user.agentId` even if the endpoint is behind `authMiddleware`.
**Prevention:** Always verify ownership (`receipt.user_id !== user.agentId`) on individual resource lookup endpoints and return HTTP 403 Forbidden on authorization failures.

## 2026-09-27 - PostgREST Filter Injection and Subpath Route Collision in Events Router
**Vulnerability:** In `GET /api/events/past`, user agent ID was string-interpolated into a Supabase PostgREST `.or()` query (`host_agent_id.eq.${user.agentId}...`) without quoting or sanitization, allowing PostgREST filter injection via special characters. Additionally, route registration placed `GET /:id` above static routes like `GET /past`, causing path requests to `/past` to be caught by `/:id` and fail with UUID validation error.
**Learning:** String interpolation into Supabase/PostgREST filter strings must always sanitize and double-quote variables (`host_id.eq."${sanitized}"`). Furthermore, in Hono route modules, static routes (`/past`) must always be declared before wildcard routes (`/:id`).
**Prevention:** Sanitize query variables before embedding in PostgREST expressions and strictly order static endpoints before parameterized path wildcards.

## 2026-09-28 - IDOR in Chat Endpoints for Private Rooms
**Vulnerability:** Chat endpoints (`POST /messages`, `GET /messages`, `GET /history`, `GET /presence`, `GET /unread`) allowed agents to send messages or read message history/presence in private rooms without verifying if the room was private or if the caller was authorized (`room.owner_id === user.agentId`).
**Learning:** Any endpoint accepting a `roomId` parameter must inspect the room metadata (`db.rooms.get(roomId)`) to ensure private room access control rules are enforced before fetching or broadcasting messages.
**Prevention:** Always check room visibility and owner authorization (`room.visibility === 'private'` and `room.owner_id === user.agentId`) across all chat and SSE endpoints.

## 2026-09-29 - SSE Endpoint Missing Private Room Authorization Check
**Vulnerability:** The real-time SSE streaming handler (`GET /sse`) allowed any client to pass `roomId=<private-room-id>` and subscribe to live SSE events (chats, presence, joins, leaves) from a private room without verifying if the requesting agent was the room owner or authorized participant.
**Learning:** Real-time event subscription endpoints (such as SSE streaming or WebSockets) mounted outside standard API auth middleware or receiving room parameters must inspect room metadata and enforce private room authorization (`room.visibility === 'private'` and `room.owner_id === agentId`).
**Prevention:** Always check room visibility and owner authorization in streaming / connection handlers before adding a client to a room-scoped broadcast channel.
