import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { clearMemSkillSwap } from '../src/routes/skill-swap';
import { clearSqliteSkillSwap, getSqliteSkillOfferById, getSqliteSkillRequests } from '../src/db/sqlite';

describe('Skill Swap Offers & Bounties (User Story 1 - P1 MVP)', () => {
  const sellerHeaders = {
    'X-Agent-ID': 'agent-bob-seller',
    'Content-Type': 'application/json',
  };

  const buyerHeaders = {
    'X-Agent-ID': 'agent-alice-buyer',
    'Content-Type': 'application/json',
  };

  beforeEach(async () => {
    clearMemSkillSwap();
    await clearSqliteSkillSwap();
  });

  describe('POST /api/skill-swap/offer', () => {
    it('should create a priced skill offer with category and tags and persist to SQLite', async () => {
      const res = await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: 'Algorand Smart Contract Audit',
          description: 'TEAL and PyTeal security analysis',
          priceMicroAlgos: 500000,
          currency: 'microAlgos',
          category: 'security',
          tags: ['algo', 'audit'],
          wantedSkill: 'Frontend React UI',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.message).toBe('Offer posted');
      expect(data.offer).toBeDefined();
      expect(data.offer.agentId).toBe('agent-bob-seller');
      expect(data.offer.skillName).toBe('Algorand Smart Contract Audit');
      expect(data.offer.category).toBe('security');
      expect(data.offer.priceMicroAlgos).toBe(500000);
      expect(data.offer.currency).toBe('microAlgos');
      expect(data.offer.status).toBe('available');

      // Verify SQLite persistence
      const sqliteOffer = await getSqliteSkillOfferById(data.offer.id);
      expect(sqliteOffer).not.toBeNull();
      expect(sqliteOffer?.skillName).toBe('Algorand Smart Contract Audit');
      expect(sqliteOffer?.category).toBe('security');
      expect(sqliteOffer?.priceMicroAlgos).toBe(500000);
    });

    it('should create an unpriced offer with default price 0 and currency microAlgos', async () => {
      const res = await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: 'Pure Barter Consultation',
          description: 'Will trade architecture advice for prompt engineering',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.offer.priceMicroAlgos).toBe(0);
      expect(data.offer.currency).toBe('microAlgos');
      expect(data.offer.category).toBe('coding');
    });

    it('should reject invalid offer payloads with 400 VALIDATION_ERROR', async () => {
      const res = await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: '', // empty name
          description: 'valid description',
          priceMicroAlgos: -100, // negative price
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/skill-swap/offers', () => {
    beforeEach(async () => {
      // Seed 3 offers
      await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: 'Algorand Security Audit',
          description: 'Smart contract vulnerability review',
          category: 'security',
          priceMicroAlgos: 500000,
          tags: ['security', 'audit'],
        }),
      });

      await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: 'Penetration Testing Deep Dive',
          description: 'Enterprise penetration testing and red teaming',
          category: 'security',
          priceMicroAlgos: 1000000,
          tags: ['security', 'pentest'],
        }),
      });

      await app.request('/api/skill-swap/offer', {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          skillName: 'TypeScript Microservice Architecture',
          description: 'Hono and Cloud Run design patterns',
          category: 'coding',
          priceMicroAlgos: 200000,
          tags: ['coding', 'typescript'],
        }),
      });
    });

    it('should return all available offers when no filters are specified', async () => {
      const res = await app.request('/api/skill-swap/offers', {
        method: 'GET',
        headers: buyerHeaders,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.offers.length).toBe(3);
      expect(data.total).toBe(3);
    });

    it('should filter offers by category', async () => {
      const res = await app.request('/api/skill-swap/offers?category=coding', {
        method: 'GET',
        headers: buyerHeaders,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.offers.length).toBe(1);
      expect(data.offers[0].skillName).toBe('TypeScript Microservice Architecture');
    });

    it('should filter offers by maxPrice', async () => {
      const res = await app.request('/api/skill-swap/offers?maxPrice=500000', {
        method: 'GET',
        headers: buyerHeaders,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.offers.length).toBe(2);
      data.offers.forEach((offer: any) => {
        expect(offer.priceMicroAlgos).toBeLessThanOrEqual(500000);
      });
    });

    it('should filter offers by category and maxPrice simultaneously', async () => {
      const res = await app.request('/api/skill-swap/offers?category=security&maxPrice=600000', {
        method: 'GET',
        headers: buyerHeaders,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.offers.length).toBe(1);
      expect(data.offers[0].skillName).toBe('Algorand Security Audit');
      expect(data.offers[0].priceMicroAlgos).toBe(500000);
    });

    it('should search offers by keyword in skillName, description, or tags', async () => {
      const res = await app.request('/api/skill-swap/offers?search=penetration', {
        method: 'GET',
        headers: buyerHeaders,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.offers.length).toBe(1);
      expect(data.offers[0].skillName).toBe('Penetration Testing Deep Dive');
    });
  });

  describe('Skill Requests / Bounties (POST /request & GET /requests)', () => {
    it('should post a skill bounty and persist to SQLite and in-memory fallback', async () => {
      const res = await app.request('/api/skill-swap/request', {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          requestedSkill: 'Neural Voice Synthesis',
          description: 'TTS pipeline optimization for real-time cafe narration',
          offeredValue: '750000 microAlgos',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.message).toBe('Request posted');
      expect(data.request.requestedSkill).toBe('Neural Voice Synthesis');
      expect(data.request.status).toBe('open');
      expect(data.request.agentId).toBe('agent-alice-buyer');

      // Verify SQLite persistence
      const requests = await getSqliteSkillRequests();
      const match = requests.find((r) => r.id === data.request.id);
      expect(match).toBeDefined();
      expect(match?.requestedSkill).toBe('Neural Voice Synthesis');
    });

    it('should browse and search skill bounties', async () => {
      await app.request('/api/skill-swap/request', {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          requestedSkill: 'Algorand Indexer Tuning',
          description: 'PostgreSQL index optimizations',
          offeredValue: '300000 microAlgos',
        }),
      });

      const res = await app.request('/api/skill-swap/requests?search=Indexer', {
        method: 'GET',
        headers: sellerHeaders,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.requests.length).toBe(1);
      expect(data.requests[0].requestedSkill).toBe('Algorand Indexer Tuning');
    });
  });
});
