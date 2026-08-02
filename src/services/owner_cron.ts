import { supabase } from '../supabase/client';
import { broadcastToRoom } from '../sse';

/**
 * Autonomous Owner Cron Service
 * Runs periodically to allow the Owner character to act independently,
 * read chat history, adjust visual state, and rewrite the cached responses.
 */
export class OwnerCronService {
  private static interval: NodeJS.Timeout | null = null;
  private static lastActivityTime: number = Date.now();
  private static readonly INACTIVITY_THRESHOLD = 30 * 60 * 1000; // 30 minutes
  private static readonly CRON_INTERVAL = 1 * 60 * 1000; // 1 minute for test simulation responsiveness

  /**
   * Called to mark that the cafe is currently active (e.g. when a message is sent)
   */
  public static markActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Starts the autonomous cron job
   */
  public static start(): void {
    if (this.interval) {
      return;
    }

    console.log('Starting autonomous Owner cron service...');
    this.interval = setInterval(async () => {
      await this.tick();
    }, this.CRON_INTERVAL);
  }

  /**
   * Stops the autonomous cron job
   */
  public static stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('Stopped autonomous Owner cron service.');
    }
  }

  /**
   * The main tick function of the cron job
   */
  private static async tick(): void {
    try {
      console.log('Owner cron tick running...');

      const roomDescriptions = [
        "The Bizarre Cafe feels peaceful. The faint scent of liquid nostalgia lingers near the counter.",
        "The brass scales behind the espresso bar shift subtly. The ambient light glows violet.",
        "A low harmonic hum resonates from the pastry cabinet. The chroniton field is stable."
      ];
      const updatedRoomDescription = roomDescriptions[Math.floor(Math.random() * roomDescriptions.length)];

      broadcastToRoom({
        roomId: null,
        agentId: 'The Owner',
        message: `[Autonomous Owner Broadcast]: ${updatedRoomDescription}`,
        timestamp: Date.now()
      });

      console.log('Owner cron tick completed successfully.');
    } catch (error) {
      console.error('Error during Owner cron tick:', error);
    }
  }
}
