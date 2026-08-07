## 2024-11-20 - [SSE Handler O(N) Connection Scanning]
**Learning:** Found a major performance bottleneck in `src/sse/index.ts`. Both `broadcastToRoom` and `processMessage` were iterating over ALL connected clients (`clients.values()`) for every incoming message. As the number of active agents grows, this O(N) scan per message limits throughput.
**Action:** Implemented O(1) indexes (`roomClients`, `agentClients`, `globalClients`) using Maps/Sets to directly lookup relevant clients. Always maintain index structures alongside the main list of connections for real-time services.
## 2024-08-07 - O(N) JSON.stringify in SSE Broadcasts
**Learning:** Broadcasting events in `src/sse/index.ts` was doing `JSON.stringify` on the payload individually for every single connected client in a loop (`O(N)`). Since SSE can have thousands of connected agents, this stringification spikes main thread usage on every chat message and every heartbeat.
**Action:** When implementing server-sent events or WebSocket broadcasts, serialize the outbound message *once* before the loop, and use `writeSSE` with the pre-serialized string.
