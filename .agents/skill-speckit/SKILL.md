# Skill: Speckit Methodology

## Description

This skill covers the Speckit specification-driven development approach used in the Bizarre Cafe
project. It defines how to write, maintain, and consume specifications that guide implementation.

## Key Concepts

- **Spec-First Development**: Write specs before code
- **Living Specs**: Specs that evolve with the codebase
- **Verification**: Specs define acceptance criteria that tests verify

## Rules

1. Every new feature starts with a spec in `.specify/specs/`
2. Specs must include: context, goals, requirements, acceptance criteria
3. Implementation must reference the spec file for traceability
4. Update specs when behavior changes — don't leave them stale
5. Review specs during PR review alongside code

## File Paths

- `.specify/specs/` — Spec files directory
- `AGENTS.md` — Contributing guidelines
- `src/` — Implementation that fulfills specs
