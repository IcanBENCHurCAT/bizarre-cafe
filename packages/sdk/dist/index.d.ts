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
}
