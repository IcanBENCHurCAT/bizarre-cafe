# Skill: Coding Best Practices (TypeScript / Hono)

## Description

This skill defines TypeScript and Hono framework best practices for the Bizarre Cafe codebase.
It covers type safety, error handling, route organization, and middleware patterns.

## Key Concepts

- **Strict TypeScript**: Enable all strict flags, use `zod` for runtime validation
- **Hono Patterns**: Small, composable handlers; use middleware chains
- **Error Handling**: Structured error responses with consistent error shapes
- **Middleware**: Auth, rate limiting, circuit breaker as composable layers

## Rules

1. All route handlers must be typed with `Hono` generics
2. Use `zod` schemas for all request/response validation
3. Error responses follow a consistent shape: `{ error: { code, message, details? } }`
4. Middleware must have clear, testable boundaries
5. No `any` types — use `unknown` and narrow explicitly
6. SSE streams must handle errors and disconnections gracefully

## File Paths

- `src/index.ts` — Hono app setup, middleware composition
- `src/middleware/` — All middleware implementations
- `src/routes/` — Route handlers using Hono patterns
- `src/config.ts` — Typed configuration from env vars
