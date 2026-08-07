## 2024-11-20 - [SSE Handler O(N) Connection Scanning]
**Learning:** Found a major performance bottleneck in `src/sse/index.ts`. Both `broadcastToRoom` and `processMessage` were iterating over ALL connected clients (`clients.values()`) for every incoming message. As the number of active agents grows, this O(N) scan per message limits throughput.
**Action:** Implemented O(1) indexes (`roomClients`, `agentClients`, `globalClients`) using Maps/Sets to directly lookup relevant clients. Always maintain index structures alongside the main list of connections for real-time services.

## 2026-08-07 - N+1 redundant queries on pre-calculated counters
**Learning:** Checking counters (like `attendee_count`) using `count: 'exact'` dynamically is extremely inefficient when the table already maintains a pre-calculated field for it. Furthermore, code often references schema mismatches (like `cafe_events` vs `events`) when using un-synced generated typings.
**Action:** Always prefer pre-calculated `count` fields like `current_participants` that already exist in actual tables over running fresh aggregation queries, and always ensure Typescript types accurately reflect the database schema using `supabase gen types`.
