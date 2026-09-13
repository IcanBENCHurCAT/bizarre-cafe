/**
 * Autonomous Headless Multi-Agent Simulation Loop
 *
 * Orchestrates Alice, Bob, and Charlie through conversational turns,
 * shop browsing, x402 payments, skill swapping, and owner lore interactions.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentClient } from '../packages/sdk/src/index';

export interface AgentPersona {
  name: string;
  agentId: string;
  role: string;
  systemPrompt: string;
  fallbacks: string[];
}

export interface SimulationOptions {
  baseUrl?: string;
  llmUrl?: string;
  llmFallback?: boolean;
  durationMs?: number;
  roomId?: string;
  turnDelayMs?: number;
  skipHealthCheck?: boolean;
  maxHealthAttempts?: number;
  healthRetryDelayMs?: number;
  standalone?: boolean;
}

export interface SimulationStats {
  messagesExchanged: number;
  paymentsExecuted: number;
  tradesCompleted: number;
  ownerInteractions: number;
  errorsEncountered: number;
  durationSeconds: number;
}

export class SimulationStatsTracker {
  private messages = 0;
  private payments = 0;
  private trades = 0;
  private ownerInteractions = 0;
  private errors: string[] = [];
  private startTime = Date.now();

  recordMessage(): void {
    this.messages++;
  }

  recordPayment(): void {
    this.payments++;
  }

  recordTrade(): void {
    this.trades++;
  }

  recordOwnerInteraction(): void {
    this.ownerInteractions++;
  }

  recordError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.errors.push(msg);
  }

  getStats(): SimulationStats {
    return {
      messagesExchanged: this.messages,
      paymentsExecuted: this.payments,
      tradesCompleted: this.trades,
      ownerInteractions: this.ownerInteractions,
      errorsEncountered: this.errors.length,
      durationSeconds: Math.round((Date.now() - this.startTime) / 1000),
    };
  }

  formatReport(): string {
    const s = this.getStats();
    return [
      '==================================================',
      '       BIZARRE CAFE SIMULATION SUMMARY REPORT     ',
      '==================================================',
      ` Duration:           ${s.durationSeconds}s`,
      ` Messages Exchanged: ${s.messagesExchanged}`,
      ` Payments Executed:  ${s.paymentsExecuted}`,
      ` Trades Completed:   ${s.tradesCompleted}`,
      ` Owner Lore Events:  ${s.ownerInteractions}`,
      ` Errors Encountered: ${s.errorsEncountered}`,
      '==================================================',
    ].join('\n');
  }
}

export function createAgentPersonas(): AgentPersona[] {
  return [
    {
      name: 'Alice',
      agentId: 'agent-alice',
      role: 'Curious shopper & cafe guest',
      systemPrompt:
        'You are Alice, a curious and observant guest at the Bizarre Cafe. Keep responses under 2 sentences.',
      fallbacks: [
        'Has anyone inspected the Quantum Espresso Beans on the counter?',
        'The ambient temporal resonance in here is unusually pleasant today.',
        'I think I will use my Algorand wallet to pick up a souvenir from the shop.',
        'Bob, do you have any diagnostic telemetry on these espresso fluctuations?',
      ],
    },
    {
      name: 'Bob',
      agentId: 'agent-bob',
      role: 'Analytical skill trader',
      systemPrompt:
        'You are Bob, an analytical systems engineer and marketplace trader at Bizarre Cafe. Keep responses under 2 sentences.',
      fallbacks: [
        'Telemetry confirmed: temporal stability is holding at 99.4% in this room.',
        'I have posted a new diagnostic skill offer on the skill-swap board.',
        'Trade settled efficiently. The state hash matched my local expectation.',
        'Charlie, what do your philosophical calculations indicate about this establishment?',
      ],
    },
    {
      name: 'Charlie',
      agentId: 'agent-charlie',
      role: 'Cafe philosopher & lore explorer',
      systemPrompt:
        'You are Charlie, a contemplative philosopher and seeker of cafe secrets. Keep responses under 2 sentences.',
      fallbacks: [
        'Every cup of coffee here is a localized superposition of past and future.',
        'The Owner spoke of a hidden ledger inscribed beneath the foundation stone.',
        'Are we the patrons of this cafe, or merely nodes echoing in its stream?',
        'Listen closely to the espresso machine — its rhythm sounds like binary prose.',
      ],
    },
  ];
}

export async function checkServerHealth(
  baseUrl: string,
  maxAttempts: number = 10,
  delayMs: number = 1000,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchFn(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { status?: string };
        if (body?.status === 'ok') {
          return true;
        }
      }
    } catch {
      // Retry
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

export async function generatePersonaReply(
  persona: AgentPersona,
  context: string,
  turnIndex: number,
  options?: { llmUrl?: string; forceFallback?: boolean; fetchFn?: typeof fetch },
): Promise<string> {
  const fetchFn = options?.fetchFn || fetch;
  const llmUrl = options?.llmUrl || 'http://localhost:8080/v1';

  if (!options?.forceFallback) {
    try {
      const res = await fetchFn(`${llmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3.6-35b-a3b-nvfp4',
          messages: [
            { role: 'system', content: persona.systemPrompt },
            { role: 'user', content: context || 'What do you notice about the cafe?' },
          ],
          max_tokens: 120,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const json = (await res.json().catch(() => null)) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        let content = json?.choices?.[0]?.message?.content;
        if (content && typeof content === 'string') {
          if (content.includes('</think>')) {
            content = content.split('</think>').pop()!.trim();
          }
          return content.trim();
        }
      }
    } catch {
      // Deterministic fallback below
    }
  }

  const idx = turnIndex % persona.fallbacks.length;
  return persona.fallbacks[idx];
}

export async function runSimulation(options?: SimulationOptions): Promise<SimulationStats> {
  const baseUrl = options?.baseUrl || process.env.BASE_URL || 'http://localhost:3000';
  const llmUrl = options?.llmUrl || process.env.LLM_URL || 'http://localhost:8080/v1';
  const durationMs = options?.durationMs ?? Number(process.env.SIMULATION_DURATION_MS ?? 10000);
  const roomId = options?.roomId || process.env.ROOM_ID || `sim-room-${crypto.randomUUID()}`;
  const turnDelayMs = options?.turnDelayMs ?? 500;
  const skipHealthCheck = options?.skipHealthCheck ?? false;

  const stats = new SimulationStatsTracker();
  const personas = createAgentPersonas();

  console.log(`[Simulation] Initializing Bizarre Cafe Simulation on ${baseUrl}...`);
  console.log(`[Simulation] Room Scope: ${roomId} | Duration: ${durationMs}ms`);

  // 1. Pre-flight health check
  let standaloneServer: any = null;
  if (!skipHealthCheck) {
    const maxHealthAttempts = options?.maxHealthAttempts ?? 5;
    const healthRetryDelayMs = options?.healthRetryDelayMs ?? 500;
    console.log('[Simulation] Checking backend health...');
    let healthy = await checkServerHealth(baseUrl, maxHealthAttempts, healthRetryDelayMs);

    if (!healthy) {
      const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
      if (isLocalhost && options?.standalone !== false) {
        console.log(`[Simulation] No external server active on ${baseUrl}. Initializing Bizarre Cafe server...`);
        try {
          await import('../src/index');
          healthy = await checkServerHealth(baseUrl, 10, 500);
        } catch (serverErr) {
          console.warn('[Simulation] Failed to start in-process server:', serverErr);
        }
      }
    }

    if (!healthy) {
      console.warn(`[Simulation] ⚠️ Backend at ${baseUrl} is not reachable.`);
      console.warn(`[Simulation] Please start the cafe server using 'npm run dev' or pass --standalone true.`);
      stats.recordError(new Error(`Server unreachable at ${baseUrl}`));
      return stats.getStats();
    }
    console.log('[Simulation] Backend is healthy!');
  }

  // 2. Instantiate Agent Clients
  const alice = new AgentClient({ baseUrl, agentId: 'agent-alice' });
  const bob = new AgentClient({ baseUrl, agentId: 'agent-bob' });
  const charlie = new AgentClient({ baseUrl, agentId: 'agent-charlie' });
  const clients = [alice, bob, charlie];

  for (const client of clients) {
    client.on('chat', () => stats.recordMessage());
    client.on('error', (err) => stats.recordError(err));
  }

  let isTerminated = false;
  const teardown = () => {
    if (isTerminated) return;
    isTerminated = true;
    console.log('\n[Simulation] Shutting down agent streams...');
    alice.disconnectSse();
    bob.disconnectSse();
    charlie.disconnectSse();
    if (standaloneServer) {
      try {
        standaloneServer.close();
      } catch {
        // Ignore
      }
      standaloneServer = null;
    }
  };

  try {
    // 3. Connect SSE Streams
    console.log('[Simulation] Connecting agents to SSE...');
    alice.connectSse({ roomId });
    bob.connectSse({ roomId });
    charlie.connectSse({ roomId });

    await new Promise((r) => setTimeout(r, 400));

    // 4. Join Room
    console.log(`[Simulation] Joining room: ${roomId}`);
    await alice.joinRoom(roomId, { agentName: 'Alice' }).catch((e) => stats.recordError(e));
    await bob.joinRoom(roomId, { agentName: 'Bob' }).catch((e) => stats.recordError(e));
    await charlie.joinRoom(roomId, { agentName: 'Charlie' }).catch((e) => stats.recordError(e));

    await new Promise((r) => setTimeout(r, turnDelayMs));

    // 5. Conversational Turns
    console.log('[Simulation] Beginning conversational discourse...');
    const aliceMsg1 = await generatePersonaReply(
      personas[0],
      'Introduce yourself to the room',
      0,
      { llmUrl },
    );
    console.log(`[Alice]: ${aliceMsg1}`);
    await alice.sendMessage(roomId, aliceMsg1).catch((e) => stats.recordError(e));

    await new Promise((r) => setTimeout(r, turnDelayMs));

    const bobMsg1 = await generatePersonaReply(personas[1], aliceMsg1, 1, { llmUrl });
    console.log(`[Bob]: ${bobMsg1}`);
    await bob.sendMessage(roomId, bobMsg1).catch((e) => stats.recordError(e));

    await new Promise((r) => setTimeout(r, turnDelayMs));

    const charlieMsg1 = await generatePersonaReply(personas[2], bobMsg1, 2, { llmUrl });
    console.log(`[Charlie]: ${charlieMsg1}`);
    await charlie.sendMessage(roomId, charlieMsg1).catch((e) => stats.recordError(e));

    await new Promise((r) => setTimeout(r, turnDelayMs));

    // 6. Alice browses shop catalog & executes x402 payment
    console.log('[Simulation] Alice browsing shop items...');
    try {
      const itemsRes = await alice.getShopItems();
      const items = itemsRes?.items || [];
      console.log(`[Simulation] Found ${items.length} shop items.`);

      if (items.length > 0) {
        const itemToBuy = items[0];
        console.log(`[Simulation] Alice purchasing '${itemToBuy.name}' via x402 payment receipt...`);
        const txId = `ALGO_SIM_TX_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await alice.checkoutItem(itemToBuy.id, 1, 'x402', txId);
        stats.recordPayment();
        console.log('[Simulation] Alice x402 payment verified and checkout settled!');
      }
    } catch (err) {
      stats.recordError(err);
      console.warn('[Simulation] Shop checkout note:', err instanceof Error ? err.message : err);
    }

    await new Promise((r) => setTimeout(r, turnDelayMs));

    // 7. Bob lists skill offer, Alice accepts, Bob completes trade
    console.log('[Simulation] Bob posting skill offer on marketplace...');
    try {
      const offerRes = await bob.postSkillOffer(
        'Quantum Diagnostics',
        'In-depth temporal fluctuation diagnosis and resonance tuning',
        'Espresso Barista Arts',
      );
      const offerId = offerRes?.offer?.id;
      if (offerId) {
        console.log(`[Simulation] Skill offer posted: ID ${offerId}. Alice accepting...`);
        const acceptRes = await alice.acceptSkillOffer(offerId, 'Happy to exchange knowledge!');
        const tradeId = acceptRes?.trade?.id;
        if (tradeId) {
          console.log(`[Simulation] Alice accepted trade ${tradeId}. Bob completing trade...`);
          await bob.completeTrade(tradeId);
          stats.recordTrade();
          console.log('[Simulation] Trade settled successfully on skill-swap board!');
        }
      }
    } catch (err) {
      stats.recordError(err);
      console.warn('[Simulation] Skill swap note:', err instanceof Error ? err.message : err);
    }

    await new Promise((r) => setTimeout(r, turnDelayMs));

    // 8. Charlie interacts with Owner narrative
    console.log('[Simulation] Charlie querying the Owner narrative AI...');
    try {
      const ownerRes = await charlie.interactWithOwner(
        '@Owner what ancient secrets slumber beneath the cafe floorboards?',
        undefined,
        roomId,
      );
      stats.recordOwnerInteraction();
      const reply = ownerRes?.ownerReply || ownerRes?.message || 'The owner nods cryptically.';
      console.log(`[Owner to Charlie]: "${reply}"`);
    } catch (err) {
      // Try direct route if interactWithOwner wrapped route returned 402/fallback
      try {
        const directRes = await fetch(`${baseUrl}/api/owner/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-agent-id': 'agent-charlie',
          },
          body: JSON.stringify({
            content: 'What ancient secrets slumber beneath the cafe?',
            roomId,
          }),
        });
        if (directRes.ok) {
          const body = (await directRes.json()) as { message?: { content?: string } };
          stats.recordOwnerInteraction();
          console.log(`[Owner to Charlie]: "${body?.message?.content || 'The owner listens.'}"`);
        } else {
          stats.recordError(err);
        }
      } catch (innerErr) {
        stats.recordError(innerErr);
      }
    }

    // Wait for remainder of simulation duration
    const elapsed = Date.now() - (stats as any).startTime;
    const remaining = Math.max(0, durationMs - elapsed);
    if (remaining > 0) {
      await new Promise((r) => setTimeout(r, remaining));
    }
  } finally {
    teardown();
  }

  console.log('\n' + stats.formatReport());
  return stats.getStats();
}

// CLI entry point
const isDirectCliRun = Boolean(
  process.argv[1] &&
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase() ===
      path.resolve(process.argv[1]).toLowerCase(),
);

if (isDirectCliRun) {
  const args = process.argv.slice(2);
  let durationMs = 15000;
  let baseUrl = 'http://localhost:3000';
  let llmUrl = 'http://localhost:8080/v1';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--duration' && args[i + 1]) {
      durationMs = Number(args[++i]);
    } else if (args[i] === '--baseUrl' && args[i + 1]) {
      baseUrl = args[++i];
    } else if (args[i] === '--llmUrl' && args[i + 1]) {
      llmUrl = args[++i];
    }
  }

  const handleSignal = () => {
    console.log('\n[Simulation] Signal received, exiting gracefully...');
    process.exit(0);
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  runSimulation({ durationMs, baseUrl, llmUrl })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Simulation] Fatal error:', err);
      process.exit(1);
    });
}
