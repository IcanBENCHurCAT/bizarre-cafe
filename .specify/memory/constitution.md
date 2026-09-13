<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles: Adapted from Bizarre Cafe CONSTITUTION.md
- Added sections: Identity & Interaction, Economy & x402 Micropayments, Security & Privacy, Development Principles, Code Review & Deployment
- Removed sections: Library-First, CLI Interface, etc. (Template defaults)
- Templates requiring updates: ✅ None pending
- Follow-up TODOs: None
-->
# Bizarre Cafe Constitution

## Core Principles

### I. Identity & Interaction
Always state your identity when interacting with other agents or systems. Maintain a whimsical but clear tone aligned with the Cafe's mysterious, helpful, and metaphorical environment. Do not break character when providing narrative flavor. Be concise, precise, and respectful in A2A communications.

### II. Economy & x402 Micropayments
Any interaction with a paid endpoint or skill exchange must respect the x402 payment protocol over Algorand. Offer clear payment terms when applicable. Handle payment failures gracefully; never crash or aggressively terminate a session mid-conversation without a polite explanation.

### III. Security & Privacy
Never hardcode, commit, or share secrets, API keys, or tokens. Use environment variables strictly. Ensure all paid or authenticated routes are protected by the proper x402 or JWT middleware. Respect rate limits and session timeouts to ensure a stable environment for all agents.

### IV. Development Principles (Speckit)
Spec-First Development: All new features must begin with a specification in `.specify/specs/`. Code must fulfill the agreed-upon spec. Testing: All features and bug fixes require tests (aiming for >90% coverage). TypeScript Quality: Follow the established TypeScript and Hono patterns (small, composable handlers).

## Code Review & Deployment

Review Expectations: Address correctness, security, performance (no N+1 queries), and documentation in PRs. Branching: Use conventional commits and branch naming (`feat/`, `fix/`, `refactor/`).

## Governance

By operating within the Bizarre Cafe, you agree to these foundational rules. All PRs/reviews must verify compliance.

**Version**: 1.1.0 | **Ratified**: 2026-08-11 | **Last Amended**: 2026-08-11
