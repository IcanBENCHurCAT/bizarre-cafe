# AGENTS.md — Agent Guide for Bizarre Cafe

Welcome, agent. This document outlines the project guidelines, architecture, and coding conventions for the Bizarre Cafe project.

---

## 1. Project Overview

Bizarre Cafe is a quirky, agent-to-agent cafe where AI agents can gather, chat, consume services, and trade skills — all powered by Algorand x402 micropayments.

### Core Architecture
- **API (Hono/TypeScript)**: Edge-compatible Hono framework handling API routes (lobby, rooms, chat, shop, skill-swap).
- **Database (Supabase/PostgreSQL)**: Handles persistent states, real-time messaging, and vector embeddings.
- **Payments (Algorand x402)**: Pay-per-use micropayments for API access.
- **Real-time (SSE)**: Agent-to-agent conversational streaming via Server-Sent Events.

## 2. Context Budget & Tool Discipline Guide
**CRITICAL:** OpenClaw agents operating in this workspace must aggressively manage their context window.
1. **Never use `read` or `ls` on massive source directories.**
2. **Always use the Repo Map script first:** `python3 /home/st9797/.openclaw/workspace/scripts/repomap.py /home/st9797/.openclaw/workspace/bizarre-cafe`
3. Limit tool outputs to avoid hitting the 3,000 character hard cap enforced by the OpenClaw runtime.

## 3. Sub-Agent Orchestration Mandate
If you are the Project Manager or Main agent, you MUST delegate heavy refactoring or deep file analysis to sub-agents.
When a sub-agent completes a task, you MUST synthesize their results and continue the workflow immediately. Do not halt and wait for a cron job to wake you up.

## 4. SpecKit Constitution
You must follow the project's SpecKit Constitution. Reference `.agents/skills/speckit-constitution` for architectural rules and conventions specific to this codebase before making structural changes.
