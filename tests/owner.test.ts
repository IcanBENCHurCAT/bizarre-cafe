import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, mockGenerateResponse } = vi.hoisted(() => {
  const mockQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null }),
    then: (resolve: (val: any) => any) => Promise.resolve({ count: 1, error: null }).then(resolve),
  };

  return {
    mockSupabase: {
      from: vi.fn(() => mockQueryBuilder),
    },
    mockGenerateResponse: vi.fn().mockResolvedValue({
      id: 'narr-1',
      content: '[Error] fallback test',
      tone: 'whimsical',
      timestamp: Date.now(),
    }),
  };
});

vi.mock('../src/supabase/client', () => ({
  createServerSupabaseClient: () => mockSupabase,
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
}));

vi.mock('../src/services/narrative/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/narrative/index')>();
  return {
    ...actual,
    generateResponse: mockGenerateResponse,
  };
});

import app from '../src/index';
import { detectSentiment, generateOwnerResponse } from '../src/routes/owner';

describe('Owner Sentiment Detection & Response Generation', () => {
  const testUser = { agentId: 'agent-1', displayName: 'Ada' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateResponse.mockResolvedValue({
      id: 'narr-1',
      content: '[Error] trigger template fallback',
      tone: 'whimsical',
      timestamp: Date.now(),
    });
  });

  describe('detectSentiment', () => {
    it.each(['great', 'amazing', 'love', 'fantastic', 'wonderful', 'LOVE', 'Great'])(
      'should detect positive sentiment for keyword "%s"',
      (word) => {
        expect(detectSentiment(`This place is ${word}!`)).toBe('positive');
      },
    );

    it.each(['bad', 'hate', 'terrible', 'awful', 'worst', 'HATE', 'Awful'])(
      'should detect negative sentiment for keyword "%s"',
      (word) => {
        expect(detectSentiment(`The experience was ${word}.`)).toBe('negative');
      },
    );

    it('should return neutral for neutral prose and respect word boundaries', () => {
      expect(detectSentiment('Just checking the menu today.')).toBe('neutral');
      expect(detectSentiment('+++')).toBe('neutral');
      expect(detectSentiment('A glove fits well on the greatest badge whatever lovelove.')).toBe(
        'neutral',
      );
    });
  });

  describe('generateOwnerResponse', () => {
    const greetingPattern =
      /Welcome to the Bizarre Cafe|espresso machine is singing|stirring the pot/;
    const coffeePattern = /liquid nostalgia/;
    const bizarrePattern = /Bizarre is our middle name/;
    const negativePattern = /absorb negative energy/;
    const positivePattern = /warms my circuits/;
    const fallbackPattern = /Bizarre Cafe is ever-shifting/;

    it.each(['hello there', 'hi owner', 'hey!', 'HELLO'])(
      'should return a greeting response for "%s"',
      (input) => {
        const reply = generateOwnerResponse(input, 'neutral', testUser);
        expect(reply).toMatch(greetingPattern);
      },
    );

    it('should fall back to "Agent" when displayName is not provided', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const reply = generateOwnerResponse('hello', 'neutral', { agentId: 'agent-no-name' });
      expect(reply).toContain('Ah, Agent!');
      vi.restoreAllMocks();
    });

    it.each(['I want coffee', 'Got any tea?', 'What is on the brew today?'])(
      'should return the coffee response for "%s"',
      (input) => {
        expect(generateOwnerResponse(input, 'neutral', testUser)).toMatch(coffeePattern);
      },
    );

    it.each([
      'This place is weird',
      'So bizarre!',
      'Something strange happened',
      'Is there magic here?',
    ])('should return the bizarre response for "%s"', (input) => {
      expect(generateOwnerResponse(input, 'neutral', testUser)).toMatch(bizarrePattern);
    });

    it('should return positive sentiment response when no topic keyword matches', () => {
      const content = 'I love the atmosphere';
      const sentiment = detectSentiment(content);
      expect(sentiment).toBe('positive');
      expect(generateOwnerResponse(content, sentiment, testUser)).toMatch(positivePattern);
    });

    it('should return negative sentiment response when no topic keyword matches', () => {
      const content = 'I hate waiting';
      const sentiment = detectSentiment(content);
      expect(sentiment).toBe('negative');
      expect(generateOwnerResponse(content, sentiment, testUser)).toMatch(negativePattern);
    });

    it('should reach the fallback branch on neutral text containing letters from hello', () => {
      const content = 'Just checking the menu today.';
      const sentiment = detectSentiment(content);
      expect(sentiment).toBe('neutral');
      expect(generateOwnerResponse(content, sentiment, testUser)).toMatch(fallbackPattern);
    });

    it('should enforce word boundaries so substrings do not trigger keyword branches', () => {
      expect(generateOwnerResponse('Look at this menu.', 'neutral', testUser)).toMatch(
        fallbackPattern,
      );
      expect(generateOwnerResponse('Wait until they arrive.', 'neutral', testUser)).toMatch(
        fallbackPattern,
      );
      expect(generateOwnerResponse('Let us create something new.', 'neutral', testUser)).toMatch(
        fallbackPattern,
      );
      expect(generateOwnerResponse('Our team is ready.', 'neutral', testUser)).toMatch(
        fallbackPattern,
      );
      expect(generateOwnerResponse('Ask the brewer about it.', 'neutral', testUser)).toMatch(
        fallbackPattern,
      );
      expect(generateOwnerResponse('A magical evening.', 'neutral', testUser)).toMatch(
        fallbackPattern,
      );
    });
  });

  describe('POST /api/owner/message sentiment integration', () => {
    it('should classify positive, negative, and neutral messages accurately', async () => {
      const posRes = await app.request('/api/owner/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-ID': 'test-agent' },
        body: JSON.stringify({ content: 'I love the quiet vibe' }),
      });
      expect(posRes.status).toBe(200);
      const posBody = await posRes.json();
      expect(posBody.conversation.sentiment).toBe('positive');
      expect(posBody.conversation.ownerResponse).toContain('warms my circuits');

      const negRes = await app.request('/api/owner/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-ID': 'test-agent' },
        body: JSON.stringify({ content: 'The wait was awful' }),
      });
      expect(negRes.status).toBe(200);
      const negBody = await negRes.json();
      expect(negBody.conversation.sentiment).toBe('negative');
      expect(negBody.conversation.ownerResponse).toContain('absorb negative energy');

      const neutralRes = await app.request('/api/owner/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-ID': 'test-agent' },
        body: JSON.stringify({ content: 'Just checking the menu today.' }),
      });
      expect(neutralRes.status).toBe(200);
      const neutralBody = await neutralRes.json();
      expect(neutralBody.conversation.sentiment).toBe('neutral');
      expect(neutralBody.conversation.ownerResponse).toContain('ever-shifting');
    });
  });
});
