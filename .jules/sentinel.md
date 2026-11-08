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

## 2026-09-30 - IDOR in Verification Status Endpoint
**Vulnerability:** In `GET /api/verification/status`, the endpoint returned an agent's sensitive verification record (DID document, wallet address, tier) without checking if `c.user.agentId` matched the requested `agentId` query parameter, allowing any authenticated agent to inspect another agent's private verification details.
**Learning:** Identity and status inspection endpoints taking a query parameter (such as `agentId`) must verify that the requesting user's authenticated identity matches the requested resource owner (`user.agentId === agentId`).
**Prevention:** Always check `c.user.agentId === agentId` on identity/status query endpoints and reject unauthorized requests with HTTP 403 Forbidden.

## 2026-10-01 - X-Forwarded-For Rate Limiting Bypass
**Vulnerability:** In `src/middleware/rateLimiter.ts`, `c.req.header('x-forwarded-for')` was used as the rate limit key without extracting the primary client IP. When requests pass through proxy chains, `X-Forwarded-For` contains a comma-separated list of IP addresses. An attacker could bypass IP rate limits by appending arbitrary proxy IPs (e.g. `, 10.0.0.1`) to the header on subsequent requests.
**Learning:** `X-Forwarded-For` header values must be parsed to extract only the first client IP before using it as an identity key in rate limiting stores.
**Prevention:** Extract `forwardedFor.split(',')[0].trim()` to isolate the primary client IP for rate limiting calculations.

## 2026-10-02 - Private Room Authorization Check Fail-Open Bug
**Vulnerability:** Private room authorization checks used `room.owner_id && room.owner_id !== user.agentId` to deny access. When a private room had a `null` or unassigned `owner_id`, the truthiness guard (`room.owner_id &&`) evaluated to `null`, bypassing the inequality check and allowing any authenticated agent to access, join, or trigger events in private unowned rooms.
**Learning:** Guarding inequality ownership checks with truthiness checks on potentially null owner fields causes authorization to fail open when the field is null.
**Prevention:** Perform direct inequality comparisons (`room.owner_id !== user.agentId`) so null or unassigned owner fields fail closed with 403 Forbidden.

## 2026-10-03 - SQLite Verification Challenge Replay and Expiration Bypass
**Vulnerability:** `getSqliteChallenge` queried `verification_challenges` without checking `status = 'pending'` or `expires_at >= current_time`. In local/test mode or when falling back to SQLite, previously verified or expired challenges were returned, allowing verification challenge responses to be replayed to obtain fresh JWT tokens.
**Learning:** Database queries retrieving single-use tokens or challenges must explicitly filter by active status (`status = 'pending'`) and expiration timestamp (`expires_at >= ?`), especially in fallback database adapters.
**Prevention:** Always include `status = 'pending'` and `expires_at >= current_timestamp` in challenge / token lookup queries across all database implementation adapters.

## 2026-10-04 - Private Room Presence and ID Leak in Active Lobby Agents Endpoint
**Vulnerability:** In `GET /api/lobby/active`, active agents were returned directly from `db.agents.getActive()`, which includes `current_room_id`. When an agent occupied a private room, unauthenticated callers and unauthorized agents could view the secret room's ID and observe which agents were currently inside it, bypassing private room isolation.
**Learning:** System aggregation or status endpoints returning agent presence across rooms must inspect the visibility of referenced rooms and mask private identifiers unless the requesting agent is the owner of that private room.
**Prevention:** Check room metadata (`room.visibility === 'private'`) for any room references exposed in public agent rosters or status endpoints and sanitize (`current_room_id: null`) for unauthorized callers.

## 2026-10-05 - Missing Challenge Lifecycle Transitions in SQLite Database Adapter
**Vulnerability:** While `getSqliteChallenge` filtered by `status = 'pending'`, the SQLite database adapter lacked methods to update challenge statuses or revoke active challenges. In `POST /api/verification/verify`, consumed challenges were never marked as `verified` in SQLite, allowing challenges to remain pending in SQLite storage and be replayed. In addition, when requesting a new challenge via `POST /api/verification/challenge`, previous pending challenges in SQLite were never marked as `expired`.
**Learning:** When database adapters support secondary/fallback persistence (such as SQLite alongside Supabase), mutating lifecycle state transitions (such as marking single-use challenges as consumed/verified or expired) must be mirrored across both database adapters.
**Prevention:** Implement and call explicit status update (`updateSqliteChallengeStatus`) and revocation (`expireSqliteChallengesForAgent`) methods in fallback database adapters matching primary database state transitions.

## 2026-10-06 - Private Room SSE Broadcast Leakage to Global Stream Clients
**Vulnerability:** In `broadcastToRoom` (`src/sse/index.ts`), all room-scoped events (`formatted.roomId`) were unconditionally forwarded to every client in `globalClients` (`roomId === null`) without inspecting the target room's visibility. This allowed any unauthenticated or unauthorized agent connected to `/sse` with `roomId: null` to eavesdrop on private room chat messages, presence events, and owner narrative interactions.
**Learning:** In real-time multi-channel broadcasting architectures where a "global" or un-scoped channel exists alongside scoped channels, broadcasting to global clients must inspect resource access boundaries. Private room events must not be fanned out to global listeners unless the listener is specifically authorized (e.g. room owner).
**Prevention:** In room broadcast functions, check room visibility (`db.rooms.get(roomId)`) before distributing messages to global clients and drop events for private rooms if `client.agentId !== room.owner_id`.

## 2026-11-06 - Framework Fingerprinting via X-Powered-By Header
**Vulnerability:** In `src/index.ts`, `app.use('*', poweredBy())` unconditionally injected `X-Powered-By: Hono` into all HTTP responses across routes. While external reverse proxies like Caddy can strip server banners (`-Server`), direct container ingress, local testing, or alternate deployment targets (like GCP Cloud Run direct access) exposed the underlying framework identity, facilitating targeted reconnaissance (CWE-200).
**Learning:** Default framework header middleware such as `poweredBy()` should not be mounted on the application root. Even with outer reverse-proxy mitigations, defense-in-depth requires eliminating framework banner emission directly from the application layer.
**Prevention:** Do not use `poweredBy()` middleware in application entry points; rely on `secureHeaders()` to set defensive headers without revealing underlying runtime details.

## 2026-11-08 - Unvalidated Chat Date Cursor Parameters and Filter Inversion
**Vulnerability:** In `src/routes/chat.ts`, cursor pagination parameters (`before` and `after`) in `GET /api/chat/messages` and `GET /api/chat/history` were defined as unvalidated strings (`z.string().optional()`). When passed to `new Date(...).toISOString()`, malformed or non-ISO input strings threw an unhandled native `RangeError: Invalid time value`, crashing the route handler and returning HTTP 500 `UNKNOWN_ERROR` instead of HTTP 400 `VALIDATION_ERROR`. Furthermore, `GET /api/chat/messages` mapped `validated.before` into the database query's `after` option, inverting cursor pagination logic.
**Learning:** Date-based cursor parameters must be strictly validated at the schema level using ISO 8601 datetime validation (`z.string().datetime({ offset: true }).optional()`) before being consumed by date parsing or database query builders. In addition, parameter mapping between HTTP query contracts and database options must be explicitly tested.
**Prevention:** Always validate cursor timestamp strings with `z.string().datetime()` in Zod schemas and verify that directional filters (`before` and `after`) map accurately to database queries.
