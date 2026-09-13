import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AgentClient,
  type X402Challenge,
  type PostSkillOfferOptions,
} from '../packages/sdk/src/index';

describe('AgentClient Skill Marketplace & Escrow Methods', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('postSkillOffer', () => {
    it('should post a priced skill offer with category using options object', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('http://localhost:3000/api/skill-swap/offer');
        expect(init?.method).toBe('POST');
        const headers = init?.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/json');
        expect(headers['x-agent-id']).toBe('agent-bob');

        const body = JSON.parse(init?.body as string);
        expect(body.skillName).toBe('Quantum Algorithm Optimization');
        expect(body.description).toBe('Advanced QPU pipeline optimization');
        expect(body.category).toBe('quantum-computing');
        expect(body.priceMicroAlgos).toBe(250000);
        expect(body.currency).toBe('microAlgos');
        expect(body.tags).toEqual(['qpu', 'speedup']);

        return new Response(
          JSON.stringify({
            message: 'Offer created',
            offer: { id: 'offer-uuid-1', ...body },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-bob',
      });

      const options: PostSkillOfferOptions = {
        skillName: 'Quantum Algorithm Optimization',
        description: 'Advanced QPU pipeline optimization',
        category: 'quantum-computing',
        priceMicroAlgos: 250000,
        currency: 'microAlgos',
        tags: ['qpu', 'speedup'],
      };

      const result = await client.postSkillOffer(options);
      expect(result.message).toBe('Offer created');
      expect(result.offer.id).toBe('offer-uuid-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should support legacy positional parameters for backward compatibility', async () => {
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        expect(body.skillName).toBe('Espresso Tuning');
        expect(body.description).toBe('Calibrating extraction temperature');
        expect(body.wantedSkill).toBe('Pastry Baking');

        return new Response(
          JSON.stringify({
            message: 'Offer created',
            offer: { id: 'offer-legacy-1', ...body },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-bob',
      });

      const result = await client.postSkillOffer(
        'Espresso Tuning',
        'Calibrating extraction temperature',
        'Pastry Baking',
      );
      expect(result.offer.skillName).toBe('Espresso Tuning');
    });

    it('should throw when postSkillOffer fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid payload' } }), {
          status: 400,
          statusText: 'Bad Request',
        }),
      );
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-bob',
      });

      await expect(client.postSkillOffer('', '')).rejects.toThrow('Failed to post skill offer');
    });
  });

  describe('acceptSkillOfferWithEscrow', () => {
    it('should accept offer directly when paymentTxId is provided in options', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('http://localhost:3000/api/skill-swap/offers/offer-uuid-123/accept');
        expect(init?.method).toBe('POST');
        const headers = init?.headers as Record<string, string>;
        expect(headers['x-x402-payment']).toBe('ALGO_DIRECT_TX_123');
        expect(headers['x-agent-id']).toBe('agent-alice');

        const body = JSON.parse(init?.body as string);
        expect(body.agentId).toBe('agent-alice');
        expect(body.notes).toBe('Funded upfront');
        expect(body.txId).toBe('ALGO_DIRECT_TX_123');

        return new Response(
          JSON.stringify({
            message: 'Offer accepted with escrow',
            trade: {
              id: 'trade-uuid-123',
              status: 'in_progress',
              paymentStatus: 'escrowed',
              priceMicroAlgos: 100000,
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
      });

      const res = await client.acceptSkillOfferWithEscrow('offer-uuid-123', {
        paymentTxId: 'ALGO_DIRECT_TX_123',
        notes: 'Funded upfront',
      });

      expect(res.trade.id).toBe('trade-uuid-123');
      expect(res.trade.status).toBe('in_progress');
      expect(res.trade.paymentStatus).toBe('escrowed');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should catch 402 challenge, resolve via onPaymentRequired, and retry acceptance', async () => {
      let callCount = 0;
      const challengePayload = {
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'x402 payment required to accept this priced skill offer',
          challenge: {
            paymentId: 'escrow-offer-uuid-456',
            receiverWallet: 'CAFE_RECEIVER_ALGO_WALLET_TEST',
            amount: 150000,
            currency: 'microAlgos',
            network: 'algorand-testnet',
            expiresAt: Date.now() + 300000,
          },
        },
      };

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        callCount++;
        if (callCount === 1) {
          // First request without payment returns 402 challenge
          return new Response(JSON.stringify(challengePayload), {
            status: 402,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Retry request must contain the payment header and txId
        const headers = init?.headers as Record<string, string>;
        expect(headers['x-x402-payment']).toBe('RESOLVED_ALGO_TX_999');
        const body = JSON.parse(init?.body as string);
        expect(body.txId).toBe('RESOLVED_ALGO_TX_999');
        expect(body.notes).toBe('Retried with payment');

        return new Response(
          JSON.stringify({
            message: 'Offer accepted with escrow',
            trade: {
              id: 'trade-uuid-456',
              status: 'in_progress',
              paymentStatus: 'escrowed',
              priceMicroAlgos: 150000,
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const onPaymentRequired = vi.fn(async (challenge: X402Challenge) => {
        expect(challenge.paymentId).toBe('escrow-offer-uuid-456');
        expect(challenge.amount).toBe(150000);
        expect(challenge.receiverWallet).toBe('CAFE_RECEIVER_ALGO_WALLET_TEST');
        return 'RESOLVED_ALGO_TX_999';
      });

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
      });

      const res = await client.acceptSkillOfferWithEscrow('offer-uuid-456', {
        notes: 'Retried with payment',
        onPaymentRequired,
      });

      expect(callCount).toBe(2);
      expect(onPaymentRequired).toHaveBeenCalledTimes(1);
      expect(res.trade.id).toBe('trade-uuid-456');
      expect(res.trade.paymentStatus).toBe('escrowed');
    });

    it('should fall back to client config onPaymentRequired if options handler is not passed', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              challenge: {
                paymentId: 'escrow-offer-789',
                receiverWallet: 'CAFE_RECEIVER',
                amount: 80000,
              },
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            message: 'Offer accepted with escrow',
            trade: { id: 'trade-uuid-789', paymentStatus: 'escrowed' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const clientPaymentHandler = vi.fn().mockResolvedValue('CONFIG_TX_ID');
      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
        onPaymentRequired: clientPaymentHandler,
      });

      const res = await client.acceptSkillOfferWithEscrow('offer-uuid-789');
      expect(res.trade.id).toBe('trade-uuid-789');
      expect(clientPaymentHandler).toHaveBeenCalledTimes(1);
    });

    it('should throw descriptive error when 402 returned but no handler configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'x402 required' } }),
          { status: 402, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
      });

      await expect(client.acceptSkillOfferWithEscrow('offer-uuid-no-handler')).rejects.toThrow(
        'Payment required: 402 challenge returned but no payment handler resolved it',
      );
    });
  });

  describe('completeTrade and cancelTrade', () => {
    it('should call complete endpoint with notes and return response', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('http://localhost:3000/api/skill-swap/trades/trade-123/complete');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init?.body as string);
        expect(body.notes).toBe('All deliverables checked');

        return new Response(
          JSON.stringify({
            message: 'Trade completed successfully',
            tradeId: 'trade-123',
            status: 'completed',
            paymentStatus: 'settled',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-bob',
      });

      const result = await client.completeTrade('trade-123', 'All deliverables checked');
      expect(result.status).toBe('completed');
      expect(result.paymentStatus).toBe('settled');
    });

    it('should call cancel endpoint with reason and return response', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('http://localhost:3000/api/skill-swap/trades/trade-456/cancel');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init?.body as string);
        expect(body.reason).toBe('Mutual agreement to cancel');

        return new Response(
          JSON.stringify({
            message: 'Trade cancelled',
            tradeId: 'trade-456',
            status: 'cancelled',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
      });

      const result = await client.cancelTrade('trade-456', 'Mutual agreement to cancel');
      expect(result.status).toBe('cancelled');
    });

    it('should fetch trades and single trade by id', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/trades/trade-999')) {
          return new Response(
            JSON.stringify({
              trade: { id: 'trade-999', status: 'in_progress' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            trades: [{ id: 'trade-999' }],
            total: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      globalThis.fetch = mockFetch;

      const client = new AgentClient({
        baseUrl: 'http://localhost:3000',
        agentId: 'agent-alice',
      });

      const trades = await client.getTrades();
      expect(trades.total).toBe(1);

      const single = await client.getTrade('trade-999');
      expect(single.trade.id).toBe('trade-999');
    });
  });
});
