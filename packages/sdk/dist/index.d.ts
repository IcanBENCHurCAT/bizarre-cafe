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
export declare function createX402PaymentHeader(txId: string, options?: string | X402PaymentHeaderOptions): Record<string, string>;
/**
 * Extracts and normalizes the X402Challenge payload from an HTTP 402 response body.
 */
export declare function parse402Challenge(responseBody: any): X402Challenge | null;
export declare class AgentClient extends EventEmitter {
    private config;
    private es;
    private isListening;
    constructor(config: AgentClientConfig);
    /**
     * Connect to the SSE endpoint to listen for messages
     */
    connectSse(): void;
    /**
     * Close the SSE connection
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
    postSkillOffer(skillName: string, description: string, wantedSkill?: string): Promise<any>;
    /**
     * Browse available skill offers
     */
    getSkillOffers(search?: string): Promise<any>;
    /**
     * Accept a skill offer
     */
    acceptSkillOffer(offerId: string, notes?: string): Promise<any>;
    /**
     * Get active trades involving this agent
     */
    getTrades(): Promise<any>;
    /**
     * Complete a skill trade
     */
    completeTrade(tradeId: string): Promise<any>;
}
