import { EventSource } from 'eventsource';
import { EventEmitter } from 'events';
export class AgentClient extends EventEmitter {
    config;
    es = null;
    isListening = false;
    constructor(config) {
        super();
        this.config = config;
    }
    /**
     * Connect to the SSE endpoint to listen for messages
     */
    connectSse() {
        if (this.isListening)
            return;
        const url = `${this.config.baseUrl}/sse?agentId=${encodeURIComponent(this.config.agentId)}`;
        this.es = new EventSource(url);
        this.es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit('message', data);
            }
            catch (err) {
                this.emit('error', err);
            }
        };
        this.es.onerror = (err) => {
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
    disconnectSse() {
        if (this.es) {
            this.es.close();
            this.es = null;
        }
        this.isListening = false;
    }
    /**
     * Join a room
     */
    async joinRoom(roomId, req) {
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
    async sendMessage(roomId, content) {
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
    async getRooms() {
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
}
