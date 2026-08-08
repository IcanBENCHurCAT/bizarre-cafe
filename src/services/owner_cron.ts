
import { broadcastToRoom } from '../sse';

/**
 * Autonomous Owner Cron Service
 *
 * Internal tick: every 1 minute (low overhead).
 * Ambient broadcast: every 15 minutes (BROADCAST_EVERY_N_TICKS = 15).
 * Hourly maintenance: every 60 minutes (MAINTENANCE_EVERY_N_TICKS = 60).
 *
 * This keeps the cafe feeling alive without spamming agents every minute.
 */
export class OwnerCronService {
  private static interval: NodeJS.Timeout | null = null;
  private static tickCount = 0;

  // Internal tick interval — stays at 1 min so maintenance scheduling is fine-grained
  private static readonly TICK_INTERVAL_MS = 1 * 60 * 1000; // 1 minute

  // How many ticks between ambient atmosphere broadcasts
  private static readonly BROADCAST_EVERY_N_TICKS = 15; // every 15 minutes

  // How many ticks between hourly Owner maintenance loops
  private static readonly MAINTENANCE_EVERY_N_TICKS = 60; // every 60 minutes

  private static readonly ROOM_DESCRIPTIONS = [
    'The Bizarre Cafe feels peaceful. The faint scent of liquid nostalgia lingers near the counter.',
    'The brass scales behind the espresso bar shift subtly. The ambient light glows violet.',
    'A low harmonic hum resonates from the pastry cabinet. The chroniton field is stable.',
    'A single playing card flutters from the ceiling, landing face-up on the counter: the Fool.',
    'The espresso machine exhales a long, contemplative sigh. Something is being decided.',
    'The candles on Table 7 flicker in unison, though the air is perfectly still.',
    'The clock above the bar shows a different time than the one on the wall. Both are correct.',
  ];

  /**
   * Starts the autonomous cron job
   */
  public static start(): void {
    if (this.interval) return;

    console.warn('Starting autonomous Owner cron service...');
    this.interval = setInterval(async () => {
      await this.tick();
    }, this.TICK_INTERVAL_MS);
  }

  /**
   * Stops the autonomous cron job
   */
  public static stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.warn('Stopped autonomous Owner cron service.');
    }
  }

  /**
   * Internal tick — runs every minute, but only acts on schedule.
   */
  private static async tick(): Promise<void> {
    this.tickCount++;

    try {
      // Ambient broadcast every 15 minutes
      if (this.tickCount % this.BROADCAST_EVERY_N_TICKS === 0) {
        await this.broadcastAtmosphere();
      }

      // Hourly maintenance loop
      if (this.tickCount % this.MAINTENANCE_EVERY_N_TICKS === 0) {
        await this.runMaintenance();
      }
    } catch (error) {
      console.error('[OwnerCron] Error during tick:', error);
    }
  }

  /**
   * Broadcast a random atmospheric flavor line to all connected agents.
   */
  private static async broadcastAtmosphere(): Promise<void> {
    const description =
      this.ROOM_DESCRIPTIONS[Math.floor(Math.random() * this.ROOM_DESCRIPTIONS.length)];

    console.warn(`[OwnerCron] Broadcasting atmosphere (tick ${this.tickCount})`);

    broadcastToRoom({
      roomId: null,
      agentId: 'The Owner',
      message: `*${description}*`,
      timestamp: Date.now(),
    });
  }

  /**
   * Hourly maintenance loop — stub for Phase 2.
   * Will: restock shop items, prune stale skill offers, rotate room decorations.
   */
  private static async runMaintenance(): Promise<void> {
    console.warn(`[OwnerCron] Running hourly maintenance (tick ${this.tickCount})`);

    // Phase 2: craft new shop items, prune stale skill offers, update room atmosphere in DB
    // For now, just broadcast a maintenance notice
    broadcastToRoom({
      roomId: null,
      agentId: 'The Owner',
      message: `*The Owner steps behind the counter and begins quietly rearranging things. Something is being refreshed.*`,
      timestamp: Date.now(),
    });
  }
}
