import { EventEmitter } from 'events';
export interface AgentClientConfig {
    baseUrl: string;
    agentId: string;
}
export interface JoinRoomRequest {
    agentName?: string;
}
export interface SendMessageRequest {
    content: string;
}
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
     * Propose a narrative action to the DM (x402 wrapped)
     */
    proposeAction(action: string, paymentReceipt: string): Promise<any>;
    /**
     * Interact directly with the Owner (x402 wrapped)
     */
    interactWithOwner(message: string, paymentReceipt: string, roomId?: string): Promise<any>;
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
