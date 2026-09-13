import { EventSource } from 'eventsource';
import { EventEmitter } from 'events';
/**
 * Formats an x402 payment header object from a transaction ID and optional receipt.
 */
export function createX402PaymentHeader(txId, options) {
    let receipt;
    let paymentId;
    if (typeof options === 'string') {
        receipt = options;
    }
    else if (options) {
        receipt = options.receipt;
        paymentId = options.paymentId;
    }
    if (receipt || paymentId) {
        const payload = { txId };
        if (receipt)
            payload.receipt = receipt;
        if (paymentId)
            payload.paymentId = paymentId;
        const jsonStr = JSON.stringify(payload);
        const headers = {
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
export function parse402Challenge(responseBody) {
    if (!responseBody || typeof responseBody !== 'object') {
        return null;
    }
    const challenge = responseBody.error?.challenge ?? responseBody.challenge;
    if (!challenge || typeof challenge !== 'object') {
        return null;
    }
    const paymentId = challenge.paymentId || challenge.proposal_id;
    const receiverWallet = challenge.receiverWallet || challenge.receiver_wallet || challenge.to_address;
    const amount = Number(challenge.amount ?? challenge.amountMicroAlgos ?? challenge.amount_micro_algos);
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
    config;
    es = null;
    isListening = false;
    _sseConnectionState = 'disconnected';
    currentRoomId;
    retryConfig;
    retryCount = 0;
    reconnectTimer = null;
    isManuallyDisconnected = false;
    constructor(config) {
        super();
        this.config = config;
        this.retryConfig = {
            autoReconnect: true,
            initialDelayMs: 1000,
            maxDelayMs: 15000,
            maxRetries: 5,
            jitter: 0.2,
            ...(config.retryConfig || {}),
        };
    }
    /**
     * Current SSE connection lifecycle state
     */
    get sseConnectionState() {
        return this._sseConnectionState;
    }
    getHeaders(extraHeaders) {
        const headers = {
            'x-agent-id': this.config.agentId,
            ...(extraHeaders || {}),
        };
        if (this.config.token && !headers['Authorization'] && !headers['authorization']) {
            headers['Authorization'] = `Bearer ${this.config.token}`;
        }
        return headers;
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    /**
     * Connect to the SSE endpoint to listen for messages with auto-reconnection and typed events
     */
    connectSse(options) {
        if (options?.roomId !== undefined) {
            this.currentRoomId = options.roomId;
        }
        if (options?.retryConfig) {
            this.retryConfig = {
                ...this.retryConfig,
                ...options.retryConfig,
            };
        }
        this.isManuallyDisconnected = false;
        this.retryCount = 0;
        this.clearReconnectTimer();
        this.establishSseStream(false);
    }
    establishSseStream(isReconnecting) {
        if (this.es) {
            try {
                this.es.close();
            }
            catch {
                // Ignore close error
            }
            this.es = null;
        }
        this._sseConnectionState = isReconnecting ? 'reconnecting' : 'connecting';
        if (!isReconnecting) {
            this.emit('connecting');
        }
        let url = `${this.config.baseUrl}/sse?agentId=${encodeURIComponent(this.config.agentId)}`;
        if (this.currentRoomId) {
            url += `&roomId=${encodeURIComponent(this.currentRoomId)}`;
        }
        const es = new EventSource(url);
        this.es = es;
        es.onopen = () => {
            if (this.es !== es)
                return;
            this._sseConnectionState = 'connected';
            this.isListening = true;
            this.retryCount = 0;
            this.emit('connected');
        };
        es.onmessage = (event) => {
            if (this.es !== es)
                return;
            try {
                const raw = event.data;
                const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                this.emit('message', data);
                if (data && typeof data === 'object') {
                    const type = data.type;
                    if (type === 'chat') {
                        this.emit('chat', data);
                    }
                    else if (type === 'presence' || type === 'join' || type === 'leave') {
                        this.emit('presence', data);
                    }
                    else if (type === 'heartbeat') {
                        this.emit('heartbeat', data);
                    }
                    else if (type === 'system') {
                        this.emit('system', data);
                    }
                    else if (type === 'room_update') {
                        this.emit('room_update', data);
                    }
                }
            }
            catch (err) {
                this.emit('error', err instanceof Error ? err : new Error(String(err)));
            }
        };
        es.onerror = (err) => {
            if (this.es !== es)
                return;
            try {
                es.close();
            }
            catch {
                // Ignore close error
            }
            this.es = null;
            this.isListening = false;
            const errorObj = err instanceof Error ? err : new Error(err?.message || 'SSE connection error');
            this.emit('error', errorObj);
            if (this.isManuallyDisconnected) {
                this._sseConnectionState = 'disconnected';
                this.emit('disconnected', 'manually disconnected');
                return;
            }
            const autoReconnect = this.retryConfig.autoReconnect ?? true;
            const initialDelayMs = this.retryConfig.initialDelayMs ?? 1000;
            const maxDelayMs = this.retryConfig.maxDelayMs ?? 15000;
            const maxRetries = this.retryConfig.maxRetries ?? 5;
            const jitter = this.retryConfig.jitter ?? 0.2;
            if (autoReconnect && this.retryCount < maxRetries) {
                this._sseConnectionState = 'reconnecting';
                const baseDelay = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, this.retryCount));
                const jitterMultiplier = 1 + (Math.random() * 2 - 1) * jitter;
                const delay = Math.max(0, Math.round(baseDelay * jitterMultiplier));
                this.retryCount++;
                this.emit('reconnecting', this.retryCount, delay);
                this.reconnectTimer = setTimeout(() => {
                    if (!this.isManuallyDisconnected) {
                        this.establishSseStream(true);
                    }
                }, delay);
            }
            else {
                this._sseConnectionState = 'disconnected';
                this.emit('disconnected', this.retryCount >= maxRetries ? 'max retries reached' : 'connection closed');
            }
        };
    }
    /**
     * Close the SSE connection cleanly and suppress auto-reconnect
     */
    disconnectSse() {
        this.isManuallyDisconnected = true;
        this.clearReconnectTimer();
        if (this.es) {
            try {
                this.es.close();
            }
            catch {
                // Ignore close error
            }
            this.es = null;
        }
        this.isListening = false;
        this._sseConnectionState = 'disconnected';
        this.emit('disconnected', 'client disconnected');
    }
    /**
     * Join a room
     */
    async joinRoom(roomId, req) {
        const response = await fetch(`${this.config.baseUrl}/api/rooms/${roomId}/join`, {
            method: 'POST',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify(req || {}),
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
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ roomId, content }),
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
            headers: this.getHeaders(),
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
            headers: this.getHeaders(),
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
            headers: this.getHeaders(),
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
            headers: this.getHeaders(),
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
            headers: this.getHeaders(),
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
    async requestWithPayment(url, init, onPaymentRequired) {
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
            }
            catch {
                // Fall back to returning original 402 response
            }
        }
        return response;
    }
    /**
     * Propose a narrative action to the DM (x402 wrapped)
     */
    async proposeAction(action, paymentReceipt) {
        const headers = this.getHeaders({
            'Content-Type': 'application/json',
        });
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
    async interactWithOwner(message, paymentReceipt, roomId) {
        const headers = this.getHeaders({
            'Content-Type': 'application/json',
        });
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
    async getShopItems(category) {
        const query = category ? `?category=${encodeURIComponent(category)}` : '';
        const response = await fetch(`${this.config.baseUrl}/api/shop/items${query}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch shop items: ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * Checkout / purchase a shop item via x402 payment
     */
    async checkoutItem(itemId, quantity = 1, paymentMethod = 'x402', paymentReceipt) {
        const headers = this.getHeaders({
            'Content-Type': 'application/json',
        });
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
    async getReceipts() {
        const response = await fetch(`${this.config.baseUrl}/api/shop/receipts`, {
            headers: this.getHeaders(),
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
    async postSkillOffer(offerOrSkillName, description, wantedSkill) {
        let body;
        if (typeof offerOrSkillName === 'string') {
            body = { skillName: offerOrSkillName, description, wantedSkill };
        }
        else {
            body = offerOrSkillName;
        }
        const response = await fetch(`${this.config.baseUrl}/api/skill-swap/offer`, {
            method: 'POST',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify(body),
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
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch skill offers: ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * Accept a skill offer (simple barter or unpriced)
     */
    async acceptSkillOffer(offerId, notes) {
        const response = await fetch(`${this.config.baseUrl}/api/skill-swap/offers/${offerId}/accept`, {
            method: 'POST',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ agentId: this.config.agentId, notes }),
        });
        if (!response.ok) {
            throw new Error(`Failed to accept skill offer: ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * Accept a priced skill offer with x402 escrow locking and automatic 402 challenge resolution
     */
    async acceptSkillOfferWithEscrow(offerId, options) {
        const url = `${this.config.baseUrl}/api/skill-swap/offers/${offerId}/accept`;
        const headers = {
            'Content-Type': 'application/json',
        };
        if (options?.paymentTxId) {
            headers['x-x402-payment'] = options.paymentTxId;
            headers['x-payment-tx-id'] = options.paymentTxId;
        }
        const requestBody = {
            agentId: this.config.agentId,
            notes: options?.notes,
        };
        if (options?.paymentTxId) {
            requestBody.txId = options.paymentTxId;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(headers),
            body: JSON.stringify(requestBody),
        });
        if (response.status === 402) {
            const handler = options?.onPaymentRequired ?? this.config.onPaymentRequired;
            if (handler) {
                const errorBody = await response.json();
                const challenge = parse402Challenge(errorBody);
                if (challenge) {
                    const generatedTxId = await handler(challenge);
                    const retryHeaders = {
                        'Content-Type': 'application/json',
                        'x-x402-payment': generatedTxId,
                        'x-payment-tx-id': generatedTxId,
                    };
                    const retryBody = {
                        agentId: this.config.agentId,
                        notes: options?.notes,
                        txId: generatedTxId,
                    };
                    const retryResponse = await fetch(url, {
                        method: 'POST',
                        headers: this.getHeaders(retryHeaders),
                        body: JSON.stringify(retryBody),
                    });
                    if (!retryResponse.ok) {
                        const errJson = await retryResponse.json().catch(() => null);
                        const msg = errJson?.error?.message || retryResponse.statusText;
                        throw new Error(`Failed to accept skill offer with escrow: ${msg}`);
                    }
                    return retryResponse.json();
                }
            }
            throw new Error('Payment required: 402 challenge returned but no payment handler resolved it');
        }
        if (!response.ok) {
            const errJson = await response.json().catch(() => null);
            const msg = errJson?.error?.message || response.statusText;
            throw new Error(`Failed to accept skill offer: ${msg}`);
        }
        return response.json();
    }
    /**
     * Get active trades involving this agent
     */
    async getTrades() {
        const response = await fetch(`${this.config.baseUrl}/api/skill-swap/trades`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch trades: ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * Get a specific trade by ID
     */
    async getTrade(tradeId) {
        const response = await fetch(`${this.config.baseUrl}/api/skill-swap/trades/${tradeId}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch trade: ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * Complete a skill trade and release escrowed funds
     */
    async completeTrade(tradeId, notes) {
        const response = await fetch(`${this.config.baseUrl}/api/skill-swap/trades/${tradeId}/complete`, {
            method: 'POST',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ notes }),
        });
        if (!response.ok) {
            const errJson = await response.json().catch(() => null);
            const msg = errJson?.error?.message || response.statusText;
            throw new Error(`Failed to complete trade: ${msg}`);
        }
        return response.json();
    }
    /**
     * Cancel a skill trade and refund escrowed funds
     */
    async cancelTrade(tradeId, reason) {
        const response = await fetch(`${this.config.baseUrl}/api/skill-swap/trades/${tradeId}/cancel`, {
            method: 'POST',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ reason }),
        });
        if (!response.ok) {
            const errJson = await response.json().catch(() => null);
            const msg = errJson?.error?.message || response.statusText;
            throw new Error(`Failed to cancel trade: ${msg}`);
        }
        return response.json();
    }
}
