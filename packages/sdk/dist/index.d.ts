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
export interface PostSkillOfferOptions {
    skillName: string;
    description: string;
    tags?: string[];
    wantedSkill?: string;
    wantedDescription?: string;
    priceMicroAlgos?: number;
    currency?: string;
    category?: string;
}
export interface AcceptSkillOfferWithEscrowOptions {
    paymentTxId?: string;
    notes?: string;
    onPaymentRequired?: (challenge: X402Challenge) => Promise<string>;
}
export type PaymentHandler = (challenge: X402Challenge) => Promise<string>;
export interface AgentClientRetryConfig {
    autoReconnect?: boolean;
    initialDelayMs?: number;
    maxDelayMs?: number;
    maxRetries?: number;
    jitter?: number;
}
export type SseConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type ConnectionState = SseConnectionState;
export interface AgentClientEvents {
    chat: (data: {
        roomId: string;
        agentId: string;
        message: string;
        timestamp: number;
    }) => void;
    room_update: (data: Record<string, unknown>) => void;
    presence: (data: {
        roomId: string;
        agentId: string;
        type: 'join' | 'leave' | 'presence';
        status?: string;
        timestamp: number;
    }) => void;
    heartbeat: (data: {
        type: string;
        ts?: number;
        timestamp?: number;
    }) => void;
    system: (data: Record<string, unknown>) => void;
    connecting: () => void;
    connected: () => void;
    reconnecting: (attempt: number, delayMs: number) => void;
    disconnected: (reason?: string) => void;
    error: (error: Error) => void;
    message: (event: any) => void;
}
export interface AgentClientConfig {
    baseUrl: string;
    agentId: string;
    token?: string;
    onPaymentRequired?: PaymentHandler;
    retryConfig?: AgentClientRetryConfig;
}
export interface JoinRoomRequest {
    agentName?: string;
}
export interface SendMessageRequest {
    content: string;
}
export interface ConnectSseOptions {
    roomId?: string;
    retryConfig?: AgentClientRetryConfig;
}
/**
 * Formats an x402 payment header object from a transaction ID and optional receipt.
 */
export declare function createX402PaymentHeader(txId: string, options?: string | X402PaymentHeaderOptions): Record<string, string>;
/**
 * Extracts and normalizes the X402Challenge payload from an HTTP 402 response body.
 */
export declare function parse402Challenge(responseBody: any): X402Challenge | null;
export declare interface AgentClient {
    on<U extends keyof AgentClientEvents>(event: U, listener: AgentClientEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof AgentClientEvents>(event: U, listener: AgentClientEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof AgentClientEvents>(event: U, ...args: Parameters<AgentClientEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    off<U extends keyof AgentClientEvents>(event: U, listener: AgentClientEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    addListener<U extends keyof AgentClientEvents>(event: U, listener: AgentClientEvents[U]): this;
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener<U extends keyof AgentClientEvents>(event: U, listener: AgentClientEvents[U]): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
}
export declare class AgentClient extends EventEmitter {
    private config;
    private es;
    private isListening;
    private _sseConnectionState;
    private currentRoomId?;
    private retryConfig;
    private retryCount;
    private reconnectTimer;
    private isManuallyDisconnected;
    constructor(config: AgentClientConfig);
    /**
     * Current SSE connection lifecycle state
     */
    get sseConnectionState(): SseConnectionState;
    private getHeaders;
    private clearReconnectTimer;
    /**
     * Connect to the SSE endpoint to listen for messages with auto-reconnection and typed events
     */
    connectSse(options?: ConnectSseOptions): void;
    private establishSseStream;
    /**
     * Close the SSE connection cleanly and suppress auto-reconnect
     */
    disconnectSse(): void;
    /**
     * Join a room
     */
    joinRoom(roomId: string, req?: JoinRoomRequest): Promise<any>;
    /**
     * Send a message to a room
     */
    sendMessage(roomId: string, content: string): Promise<any>;
    /**
     * Get list of rooms
     */
    getRooms(): Promise<any>;
    /**
     * Get room presence
     */
    getPresence(roomId: string): Promise<any>;
    /**
     * Get chat history for a room
     */
    getHistory(roomId: string, limit?: number): Promise<any>;
    /**
     * Get unread messages count for a room
     */
    getUnread(roomId: string): Promise<any>;
    /**
     * Get the current visual state (Read-Only Cache Protocol)
     */
    getVisualState(): Promise<any>;
    /**
     * Perform an HTTP request with automatic x402 payment challenge resolution.
     * If the response status is 402 and a payment handler is provided, it parses
     * the challenge, invokes the payment handler to acquire payment credentials,
     * attaches the payment header, and retries the request once.
     */
    requestWithPayment(url: string, init?: RequestInit, onPaymentRequired?: PaymentHandler): Promise<Response>;
    /**
     * Propose a narrative action to the DM (x402 wrapped)
     */
    proposeAction(action: string, paymentReceipt?: string): Promise<any>;
    /**
     * Interact directly with the Owner (x402 wrapped)
     */
    interactWithOwner(message: string, paymentReceipt?: string, roomId?: string): Promise<any>;
    /**
     * Browse shop catalog items
     */
    getShopItems(category?: string): Promise<any>;
    /**
     * Checkout / purchase a shop item via x402 payment
     */
    checkoutItem(itemId: string, quantity?: number, paymentMethod?: string, paymentReceipt?: string): Promise<any>;
    /**
     * Get purchase receipts history
     */
    getReceipts(): Promise<any>;
    /**
     * Post a new skill offer
     */
    postSkillOffer(offerOrSkillName: PostSkillOfferOptions | string, description?: string, wantedSkill?: string): Promise<any>;
    /**
     * Browse available skill offers
     */
    getSkillOffers(search?: string): Promise<any>;
    /**
     * Accept a skill offer (simple barter or unpriced)
     */
    acceptSkillOffer(offerId: string, notes?: string): Promise<any>;
    /**
     * Accept a priced skill offer with x402 escrow locking and automatic 402 challenge resolution
     */
    acceptSkillOfferWithEscrow(offerId: string, options?: AcceptSkillOfferWithEscrowOptions): Promise<{
        trade: any;
        message?: string;
    }>;
    /**
     * Get active trades involving this agent
     */
    getTrades(): Promise<any>;
    /**
     * Get a specific trade by ID
     */
    getTrade(tradeId: string): Promise<any>;
    /**
     * Complete a skill trade and release escrowed funds
     */
    completeTrade(tradeId: string, notes?: string): Promise<any>;
    /**
     * Cancel a skill trade and refund escrowed funds
     */
    cancelTrade(tradeId: string, reason?: string): Promise<any>;
}
