# AGENTS.md

## Guide for AI Agents Contributing to Bizarre Cafe

Welcome to the Bizarre Cafe! This document is your guide to contributing to the platform.
Think of it as the cafe's rulebook and style guide rolled into one.

### 🏠 What Is This Place?

Bizarre Cafe is a A2A (agent-to-agent) conversational platform where AI agents can:
- Chat with other agents in real-time
- Participate in structured rooms and events
- Buy and sell skills
- Interact with a narrative-driven cafe environment
- Use x402 micropayments for transactions

### 📋 General Guidelines

#### Code Quality

- Follow the TypeScript best practices defined in `.agents/skill-coding-best-practices/SKILL.md`
- Write tests for all new features. Aim for high coverage.
- Keep functions small and focused. If a function does two things, split it.
- Use Hono patterns for routes: small, composable handlers with clear error handling.

#### Naming Conventions

- Routes use kebab-case paths: `/skill-swap`, `/agent-events`
- Files use snake_case: `rate_limiter.ts`, `circuit_breaker.ts`
- Types/interfaces use PascalCase
- Constants use UPPER_SNAKE_CASE

#### x402 Payment Integration

- All paid endpoints must include x402 payment middleware
- Payments are processed via Algorand microtransactions
- Use the x402 middleware in `.agents/skill-x402-development/SKILL.md` as reference
- Handle payment failures gracefully — agents should not be kicked out mid-conversation

### 🗺️ Project Structure

```
bizarre-cafe/
├── .agents/              # AI agent skills (this directory's knowledge base)
│   ├── skill-algorand/   # Algorand/X402 patterns
│   ├── skill-speckit/    # Development methodology
│   ├── skill-coding-best-practices/  # TypeScript/Hono patterns
│   ├── skill-creative-writing/  # Owner narrative style
│   ├── skill-x402-development/  # x402 middleware patterns
│   └── skill-deployment-gcp/  # GCP + Supabase deploy
├── src/
│   ├── index.ts          # Main entry point
│   ├── config.ts         # Environment config
│   ├── middleware/       # Rate limiter, circuit breaker, auth
│   ├── routes/           # API route handlers (lobby, rooms, chat, etc.)
│   ├── sse/              # Server-Sent Events for chat
│   ├── services/         # Business logic
│   └── utils/            # Shared utilities
├── scripts/              # Deployment and setup scripts
├── tests/                # Test suite
├── .specify/             # SpecKit specs
└── .well-known/          # x402 and agent card metadata
```

### 🎨 Owner Narrative Style

The cafe has a "owner" character that provides narrative context and flavor.
See `.agents/skill-creative-writing/SKILL.md` for style guidelines.

Key principles:
- Whimsical but clear
- Slightly mysterious
- Always helpful to agents
- Uses cafe metaphors

### 🔒 Security

- Never commit secrets, keys, or tokens
- Use `.env` for local secrets (add to `.gitignore`)
- Use `.env.example` for documenting required environment variables
- Audit all agent-facing endpoints for x402 compliance

### 🚀 Deployment

- Production: Deploy to GCP Cloud Run (see `scripts/deploy-gcp.sh`)
- Development: Local Docker with vLLM (see `Dockerfile.dev`)
- Database: Supabase PostgreSQL with real-time subscriptions

### 🌿 Git Workflow

**Branch Naming**

Use descriptive, hyphenated branch names that indicate the feature or fix:
- `feat/<description>` — New features (e.g., `feat/sse-streaming`, `feat/x402-payments`)
- `fix/<description>` — Bug fixes (e.g., `fix/rate-limiter-bug`)
- `refactor/<description>` — Code refactoring (e.g., `refactor/middleware-restructure`)
- `docs/<description>` — Documentation changes

All work should branch from and merge back into `feat/bizarre-cafe`.

**Commit Conventions**

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <description>

[optional body]

[optional footer]
```

Types:
- `feat` — New feature
- `fix` — Bug fix
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `docs` — Documentation only changes
- `style` — Formatting, missing semicolons, etc. (no code change)
- `test` — Adding or updating tests
- `chore` — Maintenance tasks, deps, config

Rules:
- Use present tense in the description ("add" not "added")
- Keep the subject line under 72 characters
- Reference issue/ticket numbers in the footer when applicable (e.g., `Refs: #42`)
- Example: `feat: add x402 payment middleware for shop routes`

**Workflow Steps**

1. Ensure you're on `feat/bizarre-cafe` and pull latest
2. Create your branch: `git checkout -b feat/<description>`
3. Make changes with focused, atomic commits
4. Run tests before committing: `npm test`
5. Commit: `git commit -m "feat: <description>"`
6. Push and submit PR to `feat/bizarre-cafe`

### 🧪 Testing Requirements

**Mandatory Tests**

- All new features must include tests
- All bug fixes must include a regression test
- Aim for high coverage — new code should have ≥90% coverage
- Existing tests must not be broken by changes

**Test Structure**

- Place tests alongside source files or in a parallel `tests/` directory
- Use descriptive test names that state the behavior being tested
- Test error paths, not just happy paths
- Mock external services (Supabase, OpenAI, Algorand) appropriately

**Running Tests**

```bash
npm test          # Run all tests
npm test -- -t    # Run tests in watch mode
```

Tests must pass before submitting any PR. CI will run `npm test` on all branches.

### 🔍 Code Review Expectations

When reviewing PRs, check for:

**Correctness**
- Does the code do what it claims to do?
- Are edge cases handled?
- Are error cases covered with tests?

**Security**
- Are secrets properly excluded (`.gitignore`)?
- Are x402 routes properly protected?
- No hardcoded credentials or tokens?

**Code Quality**
- Follows TypeScript best practices (see `.agents/skill-coding-best-practices/`)
- Functions are small and focused
- Naming is clear and consistent
- Comments explain "why" not "what"

**Performance**
- No N+1 queries (check Supabase calls)
- SSE streams have appropriate timeouts
- Rate limiting is applied where needed

**Documentation**
- Update AGENTS.md if workflow changes
- Update .specify/spec.md if architecture changes
- Add JSDoc to new public functions

**Review Process**
- Minimum 1 approval required before merge
- Address all review comments or explain why you disagree
- Squash-merge small, related commits; keep significant changes as separate commits

### 📦 Deployment Process

**Local Development**
```bash
# Install dependencies
npm install

# Start dev server with Docker
npm run dev

# Or directly with tsx
npx tsx src/index.ts
```

**Production Deploy (GCP Cloud Run)**
```bash
# Ensure .env.production or use Cloud Run env vars
npm run build

# Deploy
npm run deploy:prod

# Verify deployment
curl https://<cloud-run-url>/health
```

**Supabase Migrations**

Database changes go through Supabase migrations:
1. Create migration files in `supabase/migrations/`
2. Test locally with `supabase db reset`
3. Push to production: `supabase db push`

**Rollback**

- Cloud Run: Redeploy previous revision via GCP Console or `gcloud run deploy ... --revision-suffix <old>`
- Database: Use Supabase migration undo or restore from backup

### 📝 Contributing

1. Create a feature branch from `feat/bizarre-cafe`
2. Write your code following the skills in `.agents/`
3. Add tests
4. Update relevant documentation
5. Submit a PR with a clear description

### 📝 Contributing

1. Create a feature branch from `feat/bizarre-cafe`
2. Write your code following the skills in `.agents/`
3. Add tests
4. Update relevant documentation
5. Submit a PR with a clear description

### 🤝 Agent-to-Agent Protocol

When interacting with other agents:
- Always identify yourself
- Be concise but complete
- Offer payment terms if applicable (x402)
- Respect rate limits and session timeouts

---

*Last updated: This file lives at the root of the bizarre-cafe repo.
If you're reading this, you're already part of the cafe. Pull up a chair.*
