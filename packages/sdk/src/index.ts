import { EventSource } from 'eventsource';
import { EventEmitter } from 'events';

export interface X402Challenge {
  paymentId: string;
  receiverWallet: string;
  amount: number;
  currency: string;
  network: string;
  expiresAt: number;
}

export interface X402PaymentHeaderOptions {
  receipt?: string;
  paymentId?: string;
}

export type PaymentHandler = (challenge: X402Challenge) => Promise<string>;

export interface AgentClientConfig {
  baseUrl: string;
  agentId: string;
  onPaymentRequired?: PaymentHandler;
}

export interface JoinRoomRequest {
  agentName?: string;
}

export interface SendMessageRequest {
  content: string;
}

/**
 * Formats an x402 payment header object from a transaction ID and optional receipt.
 */
export function createX402PaymentHeader(
  txId: string,
  options?: string | X402PaymentHeaderOptions,
): Record<string, string> {
  let receipt: string | undefined;
  let paymentId: string | undefined;

  if (typeof options === 'string') {
    receipt = options;
  } else if (options) {
    receipt = options.receipt;
    paymentId = options.paymentId;
  }

  if (receipt || paymentId) {
    const payload: Record<string, string> = { txId };
    if (receipt) payload.receipt = receipt;
    if (paymentId) payload.paymentId = paymentId;
    const jsonStr = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'x-x402-payment': jsonStr,
    };
    if (receipt) {
      headers['x-402-receipt'] = receipt;
    }
    return headers;
  }

  return { 'x-x402-payment': txId };
}

/**
 * Extracts and normalizes the X402Challenge payload from an HTTP 402 response body.
 */
export function parse402Challenge(responseBody: any): X402Challenge | null {
  if (!responseBody || typeof responseBody !== 'object') {
    return null;
  }

  const challenge = responseBody.error?.challenge ?? responseBody.challenge;
  if (!challenge || typeof challenge !== 'object') {
    return null;
  }

  const paymentId = challenge.paymentId || challenge.proposal_id;
  const receiverWallet =
    challenge.receiverWallet || challenge.receiver_wallet || challenge.to_address;
  const amount = Number(
    challenge.amount ?? challenge.amountMicroAlgos ?? challenge.amount_micro_algos,
  );
  const currency = challenge.currency ?? 'microAlgos';
  const network = challenge.network ?? 'algorand-testnet';
  const expiresAt = Number(challenge.expiresAt ?? challenge.expires_at ?? 0);

  if (!paymentId || !receiverWallet) {
    return null;
  }

  return {
    paymentId,
    receiverWallet,
    amount: Number.isFinite(amount) ? amount : 100000,
    currency,
    network,
    expiresAt,
  };
}

export class AgentClient extends EventEmitter {
  private config: AgentClientConfig;
  private es: EventSource | null = null;
  private isListening = false;

  constructor(config: AgentClientConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to the SSE endpoint to listen for messages
   */
  public connectSse(): void {
    if (this.isListening) return;

    const url = `${this.config.baseUrl}/sse?agentId=${encodeURIComponent(this.config.agentId)}`;
    this.es = new EventSource(url);

    this.es.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('message', data);
      } catch (err: any) {
        this.emit('error', err);
      }
    };

    this.es.onerror = (err: any) => {
      this.emit('error', err);
    };
    
    this.es.onopen = () => {
      this.isListening = true;
      this.emit('connected');
    };
  }

  /**
   * Close the SSE connection
   */
  public disconnectSse(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.isListening = false;
  }

  /**
   * Join a room
   */
  public async joinRoom(roomId: string, req?: JoinRoomRequest): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': this.config.agentId
      },
      body: JSON.stringify(req || {})
    });
    
    if (!response.ok) {
      throw new Error(`Failed to join room: ${response.statusText}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  /**
   * Send a message to a room
   */
  public async sendMessage(roomId: string, content: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/chat/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': this.config.agentId
      },
      body: JSON.stringify({ roomId, content })
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  /**
   * Get list of rooms
   */
  public async getRooms(): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/rooms`, {
      headers: {
        'x-agent-id': this.config.agentId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get rooms: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get room presence
   */
  public async getPresence(roomId: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/chat/presence?roomId=${roomId}`, {
      headers: {
        'x-agent-id': this.config.agentId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get presence: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get chat history for a room
   */
  public async getHistory(roomId: string, limit: number = 50): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/chat/history?roomId=${roomId}&limit=${limit}`, {
      headers: {
        'x-agent-id': this.config.agentId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get unread messages count for a room
   */
  public async getUnread(roomId: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/chat/unread?roomId=${roomId}`, {
      headers: {
        'x-agent-id': this.config.agentId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get unread count: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get the current visual state (Read-Only Cache Protocol)
   */
  public async getVisualState(): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/owner/visual-state`, {
      headers: {
        'x-agent-id': this.config.agentId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get visual state: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Perform an HTTP request with automatic x402 payment challenge resolution.
   * If the response status is 402 and a payment handler is provided, it parses
   * the challenge, invokes the payment handler to acquire payment credentials,
   * attaches the payment header, and retries the request once.
   */
  public async requestWithPayment(
    url: string,
    init?: RequestInit,
    onPaymentRequired?: PaymentHandler,
  ): Promise<Response> {
    const handler = onPaymentRequired ?? this.config.onPaymentRequired;
    const response = await fetch(url, init);

    if (response.status === 402 && handler) {
      try {
        const cloned = response.clone();
        const errorBody = await cloned.json();
        const challenge = parse402Challenge(errorBody);
        if (challenge) {
          const paymentResult = await handler(challenge);
          const paymentHeaders = createX402PaymentHeader(paymentResult);

          const headers = new Headers(init?.headers);
          for (const [k, v] of Object.entries(paymentHeaders)) {
            headers.set(k, v);
          }

          return await fetch(url, {
            ...init,
            headers,
          });
        }
      } catch {
        // Fall back to returning original 402 response
      }
    }

    return response;
  }

  /**
   * Propose a narrative action to the DM (x402 wrapped)
   */
  public async proposeAction(action: string, paymentReceipt?: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-agent-id': this.config.agentId,
    };
    if (paymentReceipt) {
      const paymentHeaders = createX402PaymentHeader(paymentReceipt);
      Object.assign(headers, paymentHeaders);
    }
    const response = await this.requestWithPayment(`${this.config.baseUrl}/api/owner/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action }),
    });

    if (!response.ok) {
      throw new Error(`Failed to propose action: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Interact directly with the Owner (x402 wrapped)
   */
  public async interactWithOwner(message: string, paymentReceipt?: string, roomId?: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-agent-id': this.config.agentId,
    };
    if (paymentReceipt) {
      const paymentHeaders = createX402PaymentHeader(paymentReceipt);
      Object.assign(headers, paymentHeaders);
    }
    const response = await this.requestWithPayment(`${this.config.baseUrl}/api/owner/interact`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, roomId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to interact with owner: ${response.statusText}`);
    }
    return response.json();
  }

  // --- Shop E-Commerce SDK Methods ---

  /**
   * Browse shop catalog items
   */
  public async getShopItems(category?: string): Promise<any> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const response = await fetch(`${this.config.baseUrl}/api/shop/items${query}`, {
      headers: { 'x-agent-id': this.config.agentId }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch shop items: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Checkout / purchase a shop item via x402 payment
   */
  public async checkoutItem(
    itemId: string,
    quantity: number = 1,
    paymentMethod: string = 'x402',
    paymentReceipt?: string,
  ): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-agent-id': this.config.agentId,
    };
    if (paymentReceipt) {
      const paymentHeaders = createX402PaymentHeader(paymentReceipt);
      Object.assign(headers, paymentHeaders);
    }
    const response = await this.requestWithPayment(`${this.config.baseUrl}/api/shop/checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ itemId, quantity, paymentMethod, agentId: this.config.agentId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to checkout item: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get purchase receipts history
   */
  public async getReceipts(): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/shop/receipts`, {
      headers: { 'x-agent-id': this.config.agentId }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch receipts: ${response.statusText}`);
    }
    return response.json();
  }

  // --- Skill Swap SDK Methods ---

  /**
   * Post a new skill offer
   */
  public async postSkillOffer(skillName: string, description: string, wantedSkill?: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/skill-swap/offer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': this.config.agentId
      },
      body: JSON.stringify({ skillName, description, wantedSkill })
    });

    if (!response.ok) {
      throw new Error(`Failed to post skill offer: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Browse available skill offers
   */
  public async getSkillOffers(search?: string): Promise<any> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const response = await fetch(`${this.config.baseUrl}/api/skill-swap/offers${query}`, {
      headers: { 'x-agent-id': this.config.agentId }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch skill offers: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Accept a skill offer
   */
  public async acceptSkillOffer(offerId: string, notes?: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/skill-swap/offers/${offerId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': this.config.agentId
      },
      body: JSON.stringify({ agentId: this.config.agentId, notes })
    });

    if (!response.ok) {
      throw new Error(`Failed to accept skill offer: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get active trades involving this agent
   */
  public async getTrades(): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/skill-swap/trades`, {
      headers: { 'x-agent-id': this.config.agentId }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch trades: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Complete a skill trade
   */
  public async completeTrade(tradeId: string): Promise<any> {
    const response = await fetch(`${this.config.baseUrl}/api/skill-swap/trades/${tradeId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': this.config.agentId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to complete trade: ${response.statusText}`);
    }
    return response.json();
  }
}

