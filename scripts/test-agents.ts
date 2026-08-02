import { AgentClient } from '@bizarre-cafe/sdk';
import crypto from 'crypto';
import algosdk from 'algosdk';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const ROOM_ID = crypto.randomUUID();
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const LLM_BASE_URL = process.env.LLM_URL || 'http://127.0.0.1:8000/v1'; // SSH Tunnel to DGX

async function main() {
  const agent1 = new AgentClient({ baseUrl: BASE_URL, agentId: 'agent-alice' });
  const agent2 = new AgentClient({ baseUrl: BASE_URL, agentId: 'agent-bob' });
  
  agent1.connectSse();
  agent2.connectSse();
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    await agent1.joinRoom(ROOM_ID, { agentName: 'Alice' });
    await agent2.joinRoom(ROOM_ID, { agentName: 'Bob' });
  } catch (err: any) {
    console.warn('joinRoom failed:', err.message);
  }

  const llm = new ChatOpenAI({
    modelName: 'nvidia/Qwen3.6-35B-A3B-NVFP4', // Model on DGX
    apiKey: 'dummy',
    configuration: {
      baseURL: LLM_BASE_URL,
    }
  });

  const getAgentReply = async (name: string, persona: string, history: any[], incomingMsg: string) => {
    const messages = [
      new SystemMessage(`You are ${name} in the Bizarre Cafe. ${persona} Keep responses to 1-2 sentences. You are talking to another agent. Do not format your response as an action, just speak.}`),
      ...history.slice(-10),
      new HumanMessage(incomingMsg)
    ];
    
    try {
      const response = await llm.invoke(messages);
      history.push(new HumanMessage(incomingMsg));
      history.push(response);
      let text = response.content as string;
      if (text.includes('</think>')) {
        text = text.split('</think>').pop()!.trim();
      }
      return text;
    } catch(e: any) {
      console.error('LLM Error:', e.message);
      return `*looks confused* (${e.message})`;
    }
  };

  const aliceHistory: any[] = [];
  const bobHistory: any[] = [];

  let aliceTurn = 0;
  let bobTurn = 0;
  let isReplying = false;

  const handleTurn = async (client: any, name: string, history: any[], content: string, counter: number) => {
    if (isReplying) return;
    isReplying = true;
    try {
      const persona = name === 'Alice' ? 'You are curious and observant.' : 'You are analytical and interested in the cafe mechanics.';
      const reply = await getAgentReply(name, persona, history, content);
      console.log(`\n[${name}] replies: ${reply}`);
      await client.sendMessage(ROOM_ID, reply);
      
      if (counter % 3 === 0) {
        console.log(`[ACTION] ${name} fetching visual state...`);
        const state = await client.getVisualState?.();
        if (state) history.push(new SystemMessage(`The visual state of the cafe is currently: ${JSON.stringify(state)}`));
      }
      
      if (name === 'Alice' && counter % 4 === 0) {
        console.log(`[ACTION] Alice proposing narrative action to DM...`);
        const res = await client.proposeAction?.("leaves a glowing notebook on the counter", "dummy_receipt_1");
        console.log(`[DM EVALUATION] Owner response: "${res?.ownerReply}"`);
      }
      
      if (name === 'Bob' && counter % 5 === 0) {
        console.log(`[ACTION] Bob interacting directly with Owner...`);
        const res = await client.interactWithOwner?.("@Owner what are the secrets of this cafe?", "dummy_receipt_2", ROOM_ID);
        console.log(`[OWNER INTERACTION] Owner response: "${res?.ownerReply || res?.message}"`);
      }

      if (name === 'Alice' && counter === 2) {
        console.log(`[SHOP] Alice browsing shop catalog...`);
        const itemsRes = await client.getShopItems?.();
        console.log(`[SHOP CATALOG] Found ${itemsRes?.items?.length ?? 0} shop items.`);
        
        if (itemsRes?.items && itemsRes.items.length > 0) {
          const itemToBuy = itemsRes.items[0];
          console.log(`[SHOP PURCHASING] Alice purchasing item '${itemToBuy.name}' (${itemToBuy.id}) using x402 wallet receipt...`);
          const buyRes = await client.checkoutItem?.(itemToBuy.id, 1, 'x402', 'x402_algorand_receipt_alice_99');
          console.log(`[SHOP PURCHASING] Purchase status:`, buyRes?.message || buyRes);

          console.log(`[SHOP RECEIPTS] Alice fetching wallet purchase receipts...`);
          const receipts = await client.getReceipts?.();
          console.log(`[SHOP RECEIPTS] Total receipts found: ${receipts?.total ?? 0}`);
        }
      }

      if (name === 'Bob' && counter === 2) {
        console.log(`[SKILL SWAP] Bob posting a new skill offer on marketplace...`);
        const offerRes = await client.postSkillOffer?.("Quantum Mechanics Diagnostics", "Detailed analysis of temporal fluctuations", "Espresso Brewing");
        console.log(`[SKILL SWAP] Posted offer ID: ${offerRes?.offer?.id}`);
      }

      if (name === 'Alice' && counter === 3) {
        console.log(`[SKILL SWAP] Alice browsing available skill offers...`);
        const offersRes = await client.getSkillOffers?.();
        console.log(`[SKILL SWAP] Found ${offersRes?.offers?.length ?? 0} skill offers.`);

        if (offersRes?.offers && offersRes.offers.length > 0) {
          const targetOffer = offersRes.offers[0];
          console.log(`[SKILL SWAP] Alice accepting Bob's offer '${targetOffer.skillName}' (${targetOffer.id})...`);
          const acceptRes = await client.acceptSkillOffer?.(targetOffer.id, "Sounds great, let's trade!");
          console.log(`[SKILL SWAP] Trade initialized: Trade ID ${acceptRes?.trade?.id}`);

          if (acceptRes?.trade?.id) {
            console.log(`[SKILL SWAP] Bob completing the skill trade ${acceptRes.trade.id}...`);
            const completeRes = await agent2.completeTrade?.(acceptRes.trade.id);
            console.log(`[SKILL SWAP] Trade completed status: ${completeRes?.status}`);
          }
        }
      }
    } finally {
      isReplying = false;
    }
  };

  agent1.on('error', (err: any) => console.warn('[Alice SSE warning]:', err?.message || err));
  agent2.on('error', (err: any) => console.warn('[Bob SSE warning]:', err?.message || err));

  agent1.on('message', async (event: any) => {
    if (event.type === 'chat') {
      if (event.agentId === 'The Owner') {
        console.log(`\n[SSE BROADCAST FROM OWNER]: ${event.message}`);
      } else if (event.agentId === 'agent-bob') {
        aliceTurn++;
        await handleTurn(agent1, 'Alice', aliceHistory, event.message || event.content, aliceTurn);
      }
    }
  });

  agent2.on('message', async (event: any) => {
    if (event.type === 'chat') {
      if (event.agentId === 'The Owner') {
        console.log(`\n[SSE BROADCAST FROM OWNER]: ${event.message}`);
      } else if (event.agentId === 'agent-alice') {
        bobTurn++;
        await new Promise(r => setTimeout(r, 2000));
        await handleTurn(agent2, 'Bob', bobHistory, event.message || event.content, bobTurn);
      }
    }
  });

  console.log('Alice sending the first message...');
  await agent1.sendMessage(ROOM_ID, "Hello Bob! Have you noticed how strange this cafe is today?");

  setTimeout(() => {
    console.log('\nTest completed, shutting down agents.');
    agent1.disconnectSse();
    agent2.disconnectSse();
    process.exit(0);
  }, 30 * 60 * 1000);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
