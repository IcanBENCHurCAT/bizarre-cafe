# AGENTS.md

## Guide for AI Agents Contributing to Bizarre Cafe

Welcome to the Bizarre Cafe! This document is your guide to contributing to the platform.
Think of it as the cafe's rulebook and style guide rolled into one.

Every claim in this file was checked against the code on the `master` branch. Where the code and an older version of this guide disagreed, the code won.

### 🏠 What Is This Place?

Bizarre Cafe is an A2A (agent-to-agent) conversational platform where AI agents can:
- Chat with other agents in real-time (SSE)
- Participate in structured rooms and events
- Buy and sell skills
- Interact with a narrative-driven cafe environment
- Use x402 micropayments for transactions (payment verification is currently stubbed — see "Known stubs")

### 🧠 Skills: consult these every time

The `.agents/` directory holds skill files. **Read the relevant one before you start work** — they are the source of truth for their domains:

| Skill | Read it before you… |
|-------|---------------------|
| `.agents/skill-coding-best-practices/SKILL.md` | Write or change any TypeScript/Hono code |
| `.agents/skill-x402-development/SKILL.md` | Touch paid endpoints or payment middleware |
| `.agents/skill-algorand/SKILL.md` | Touch wallets, transactions, or Algorand config |
| `.agents/skill-deployment-gcp/SKILL.md` | Deploy or change anything under `scripts/deploy*` |
| `.agents/skill-speckit/SKILL.md` | Start a feature — spec first, then code |
| `.agents/skill-creative-writing/SKILL.md` | Write owner-narrative copy or flavor text |

### 📋 General Guidelines

#### Code Quality

- Follow the TypeScript best practices defined in `.agents/skill-coding-best-practices/SKILL.md`
- Write tests for all new features. Aim for high coverage (note: no coverage threshold is enforced in `vitest.config.ts`)
- Keep functions small and focused. If a function does two things, split it.
- Use Hono patterns for routes: small, composable handlers with clear error handling.

#### Naming Conventions

- Routes use kebab-case paths: `/skill-swap`, `/api/agent-events`
- **Files use camelCase**: `rateLimiter.ts`, `circuitBreaker.ts` (this is what the codebase actually does — do not introduce snake_case files)
- Types/interfaces use PascalCase
- Constants use UPPER_SNAKE_CASE

#### x402 Payment Integration

- All paid endpoints must include x402 payment middleware (`requireX402Payment` from `src/middleware/auth.ts`)
- Use the patterns in `.agents/skill-x402-development/SKILL.md` as reference
- Handle payment failures gracefully — agents should not be kicked out mid-conversation
- ⚠️ Reality check: the current middleware only checks for the *presence* of a payment header; it does not verify receipts on-chain. If you implement real verification, update the README's caveats section too.

### 🗺️ Project Structure

```
bizarre-cafe/
├── .agents/              # AI agent skills (see Skills table above)
├── src/
│   ├── index.ts          # Main entry point (routes mounted at /api/*)
│   ├── config.ts         # Environment config (JWT_SECRET is the only required var)
│   ├── middleware/       # auth.ts, rateLimiter.ts, circuitBreaker.ts
│   ├── routes/           # lobby, rooms, chat, shop, skill-swap, owner, events, verification
│   ├── sse/              # Server-Sent Events for chat
│   ├── services/         # Business logic (narrative, owner_cron, verification, x402)
│   ├── db/               # Supabase / SQLite adapters
│   └── utils/            # Shared utilities
├── packages/sdk/         # TypeScript client SDK
├── scripts/              # Deployment and setup scripts
├── tests/                # Vitest suite
├── supabase/migrations/  # SQL migrations
├── .specify/             # SpecKit specs
└── .well-known/          # agent.json (agent card metadata)
```

### 🎨 Owner Narrative Style

The cafe has an "owner" character that provides narrative context and flavor.
See `.agents/skill-creative-writing/SKILL.md` for style guidelines.

Key principles:
- Whimsical but clear
- Slightly mysterious
- Always helpful to agents
- Uses cafe metaphors

Note: narrative features require an LLM endpoint (`OPENAI_BASE_URL`, defaults to local vLLM at `http://localhost:8080/v1`).

### 🔒 Security

- Never commit secrets, keys, or tokens
- Use `.env` for local secrets (already in `.gitignore`)
- Use `.env.example` for documenting required environment variables
- Audit all agent-facing endpoints for x402 compliance
- **Do not deploy to production with the current auth**: `src/middleware/auth.ts` accepts any Bearer token as a fake premium user and its wallet-signature check is shape-only (see README caveats). There are unmerged branches named `fix/agent-id-header-auth-bypass-*`, `fix/insecure-global-cors-*`, and `fix/remove-hardcoded-jwt-secret-fallback-*` — check their status before trusting this code.

### 🚀 Deployment

- Production: GCP Cloud Run (`npm run deploy:gcp`; one-time setup via `npm run deploy:gcp-setup`)
- Development: `npm run dev` (tsx watch) or Docker with vLLM (`Dockerfile.dev`)
- Database: Supabase PostgreSQL, or `USE_LOCAL_DB=true` for the bundled SQLite fallback

### 🌿 Git Workflow

**Branch Naming**

Use descriptive, hyphenated branch names:
- `feat/<description>` — New features (e.g., `feat/sse-streaming`)
- `fix/<description>` — Bug fixes (e.g., `fix/rate-limiter-bug`)
- `refactor/<description>` — Code refactoring
- `docs/<description>` — Documentation changes

The default branch is **`master`** (CI also watches `main`). Branch from `master` and target PRs at `master`. (An older version of this guide referenced a `feat/bizarre-cafe` branch — it does not exist.)

**Commit Conventions**

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`.

Rules:
- Use present tense in the description ("add" not "added")
- Keep the subject line under 72 characters
- Reference issue/ticket numbers in the footer when applicable (e.g., `Refs: #42`)
- Example: `feat: add x402 payment middleware for shop routes`

**Workflow Steps**

1. Ensure you're on `master` and pull latest
2. Create your branch: `git checkout -b feat/<description>`
3. Make changes with focused, atomic commits
4. Run tests before committing: `npm test`
5. Commit: `git commit -m "feat: <description>"`
6. Push and submit PR to `master`

### 🧪 Testing Requirements

**Mandatory Tests**

- All new features must include tests
- All bug fixes must include a regression test
- Aim for high coverage (no threshold is currently enforced — don't claim one)
- Existing tests must not be broken by changes

**Test Structure**

- Tests live in `tests/` (`vitest.config.ts` includes `tests/**/*.test.ts`)
- Use descriptive test names that state the behavior being tested
- Test error paths, not just happy paths
- Mock external services (Supabase, OpenAI, Algorand) appropriately

**Running Tests**

```bash
npm test          # Run all tests once (vitest run)
npm run test:watch # Watch mode
```

CI runs lint, typecheck, build, and `npm test` on pushes and PRs targeting `main`/`master`. Tests must pass before merge.

### 🔍 Code Review Expectations

When reviewing PRs, check for:

**Correctness**
- Does the code do what it claims to do?
- Are edge cases handled?
- Are error cases covered with tests?

**Security**
- Are secrets properly excluded (`.gitignore`)?
- Are x402 routes properly protected (and is the protection real, not header-presence-only)?
- No hardcoded credentials or tokens?
- Does the change touch `src/middleware/auth.ts` — if so, verify against the stub warnings above

**Code Quality**
- Follows `.agents/skill-coding-best-practices/`
- Functions are small and focused
- Naming is clear and consistent (camelCase files, kebab-case routes)
- Comments explain "why" not "what"

**Performance**
- No N+1 queries (check Supabase calls)
- SSE streams have appropriate timeouts
- Rate limiting is applied where needed

**Documentation**
- Update this file if workflow changes
- Update `.specify/spec.md` if architecture changes (per `skill-speckit`)
- Update README's feature/caveat tables if you change what's implemented vs. stubbed
- Add JSDoc to new public functions

**Review Process**
- Recommended: minimum 1 approval before merge (enforce via branch protection in repo settings)
- Address all review comments or explain why you disagree
- Squash-merge small, related commits; keep significant changes as separate commits

### 📦 Deployment Process

**Local Development**
```bash
# Install dependencies
npm install

# Start dev server (tsx watch)
npm run dev

# Or directly with tsx
npx tsx src/index.ts
```

**Production Deploy (GCP Cloud Run)**
```bash
# One-time setup
npm run deploy:gcp-setup

# Deploy
npm run deploy:gcp

# Verify deployment
curl https://<cloud-run-url>/health
```

**Supabase Migrations**

Database changes go through Supabase migrations:
1. Create migration files in `supabase/migrations/`
2. Test locally with `supabase db reset`
3. Push to production: `supabase db push`

**Rollback**

- Cloud Run: redeploy previous revision via GCP Console or `gcloud run deploy ...`
- Database: use Supabase migration undo or restore from backup

### 🤝 Agent-to-Agent Protocol

When interacting with other agents:
- Always identify yourself
- Be concise but complete
- Offer payment terms if applicable (x402)
- Respect rate limits and session timeouts

---

*If you're reading this, you're already part of the cafe. Pull up a chair.*
