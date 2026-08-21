## 2024-11-20 - [Concurrent Supabase Queries for Reduced Latency]
**Learning:** Found sequential independent database queries in API routes (e.g., fetching an event, counting attendance, and checking user status) that unnecessarily block each other and increase total response latency by a factor of 3.
**Action:** Always batch independent queries in route handlers using `Promise.all()` before applying business logic. Wait until all data is fetched concurrently, then handle errors and evaluate conditions.
## 2024-11-20 - [SSE Handler O(N) Connection Scanning]
**Learning:** Found a major performance bottleneck in `src/sse/index.ts`. Both `broadcastToRoom` and `processMessage` were iterating over ALL connected clients (`clients.values()`) for every incoming message. As the number of active agents grows, this O(N) scan per message limits throughput.
**Action:** Implemented O(1) indexes (`roomClients`, `agentClients`, `globalClients`) using Maps/Sets to directly lookup relevant clients. Always maintain index structures alongside the main list of connections for real-time services.
## 2024-11-20 - [Verification Challenge Lookup Optimization]
**Learning:** Found an $O(N)$ lookup in the authentication verification path (`src/services/verification/index.ts`). The `verifyAgent` function iterated over all stored challenges to match a `nonce`. By changing the internal Map key from a generated `challengeId` to the `nonce` itself (which is globally unique), the lookup was reduced to $O(1)$ without affecting the external API.
**Action:** Always key internal Maps by the primary identifier used for retrieval. Cryptographic nonces are excellent candidates for Map keys.
## 2024-08-07 - O(N) JSON.stringify in SSE Broadcasts
**Learning:** Broadcasting events in `src/sse/index.ts` was doing `JSON.stringify` on the payload individually for every single connected client in a loop (`O(N)`). Since SSE can have thousands of connected agents, this stringification spikes main thread usage on every chat message and every heartbeat.
**Action:** When implementing server-sent events or WebSocket broadcasts, serialize the outbound message *once* before the loop, and use `writeSSE` with the pre-serialized string.
## 2024-11-20 - [O(N) Memory Allocation in Map Iteration]
**Learning:** Found unnecessary memory allocation when iterating over Map values in `src/sse/index.ts`. Using `Array.from(map.values())` inside high-frequency loops (like SSE heartbeats and real-time state retrieval) allocates a new array of size N on every call, increasing garbage collection pressure and CPU usage.
**Action:** When iterating over Maps or Sets, use the iterator directly (e.g., `for (const item of map.values())`) instead of converting it to an array first with `Array.from()`.
## 2023-10-27 - Database Consistency via Promise.all
**Learning:** Never use `Promise.all()` to parallelize database mutation operations (e.g. updating a trade status and an offer status concurrently) where subsequent operations are logically meant to depend on the first. The database client will execute them immediately and independently, leading to data inconsistency bugs if one fails and the other succeeds.
**Action:** When seeking parallelization optimizations with Supabase or similar database drivers, strictly ensure the queries are entirely independent (e.g. an `update` and a completely unrelated `select`) before combining them in `Promise.all`.
## 2026-08-21 - [Avoid O(N) Array Allocations on Cryptographic Utilities]
**Learning:** Functions like `generateNonce` and `hashNonce` allocated multiple intermediate arrays via `Array.from(bytes).map(...).join('')` to perform simple byte-to-hex and byte-to-char conversions. This creates unnecessary O(N) memory allocations (creating intermediate Number and String arrays) on high-frequency code paths.
**Action:** Replace `Array.from()` conversions with direct `for` loops and `+=` string concatenations in performance-critical cryptographic utility functions.
