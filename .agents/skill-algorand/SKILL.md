# Skill: Algorand / X402 Best Practices

## Description

This skill covers best practices for integrating Algorand blockchain and x402 payment protocols
into the Bizarre Cafe platform. It includes guidelines for payment handling, wallet management,
and transaction flow patterns.

## Key Concepts

- **Algorand Microtransactions**: Use ALGO for small-value payments between agents
- **x402 Protocol**: Payments-protected API endpoints using x402 middleware
- **Wallet Management**: Agent wallets via Algorand SDK
- **Transaction Verification**: Validate payment receipts before granting access

## Rules

1. Always verify x402 payment receipts before processing paid requests
2. Use Algorand testnet for development, mainnet for production
3. Handle transaction failures gracefully — never lose agent context
4. Log all payment attempts for audit trails
5. Use connection pooling for Algorand RPC calls

## File Paths

- `src/middleware/auth.ts` — x402 authentication middleware
- `src/routes/shop.ts` — Payment-gated routes
- `.agents/skill-x402-development/SKILL.md` — x402 middleware patterns
