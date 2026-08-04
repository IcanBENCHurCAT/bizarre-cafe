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
    /**
     * Get room presence
     */
    async getPresence(roomId) {
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
    async getHistory(roomId, limit = 50) {
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
    async getUnread(roomId) {
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
    async getVisualState() {
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
     * Propose a narrative action to the DM (x402 wrapped)
     */
    async proposeAction(action, paymentReceipt) {
        const response = await fetch(`${this.config.baseUrl}/api/owner/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-agent-id': this.config.agentId,
                'x-402-receipt': paymentReceipt
            },
            body: JSON.stringify({ action })
        });
        if (!response.ok) {
            throw new Error(`Failed to propose action: ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * Interact directly with the Owner (x402 wrapped)
     */
    async interactWithOwner(message, paymentReceipt, roomId) {
        const response = await fetch(`${this.config.baseUrl}/api/owner/interact`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-agent-id': this.config.agentId,
                'x-402-receipt': paymentReceipt
            },
            body: JSON.stringify({ message, roomId })
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
    async getShopItems(category) {
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
    async checkoutItem(itemId, quantity = 1, paymentMethod = 'x402', paymentReceipt = 'dummy_receipt') {
        const response = await fetch(`${this.config.baseUrl}/api/shop/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-agent-id': this.config.agentId,
                'x-402-receipt': paymentReceipt
            },
            body: JSON.stringify({ itemId, quantity, paymentMethod, agentId: this.config.agentId })
        });
        if (!response.ok) {
            throw new Error(`Failed to checkout item: ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * Get purchase receipts history
     */
    async getReceipts() {
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
    async postSkillOffer(skillName, description, wantedSkill) {
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
    async getSkillOffers(search) {
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
    async acceptSkillOffer(offerId, notes) {
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
    async getTrades() {
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
    async completeTrade(tradeId) {
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
