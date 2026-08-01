# Skill: X402 Development

## Description

This skill covers x402 middleware development patterns for the Bizarre Cafe platform.
It details how to implement payment-protected endpoints, verify x402 payment receipts,
and integrate with Algorand for microtransactions.

## Key Concepts

- **x402 Middleware**: A Hono middleware that checks for valid x402 payments before processing requests
- **Payment Receipts**: Cryptographically signed proof of payment that must be verified
- **Payment Gating**: Routes that require payment to access
- **Automatic Settlement**: x402 handles payment routing and settlement

## Rules

1. Every paid route must use the x402 middleware with proper payment requirements
2. Payment verification must be non-blocking — fail open on verification timeout
3. Log all payment attempts with agent ID and route for audit
4. Support payment retry on transient failures
5. Cache payment verification results with TTL to avoid redundant verification

## File Paths

- `src/middleware/auth.ts` — x402 authentication middleware implementation
- `src/routes/shop.ts` — Payment-gated shop routes
- `src/routes/skill-swap.ts` — Skill trading with x402 payments
- `src/middleware/rateLimiter.ts` — Rate limiting for free and paid tiers
- `src/middleware/circuitBreaker.ts` — Circuit breaker for payment gateway
