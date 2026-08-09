# AGENTS.md

Minimal guidance for AI/code agents working in this repository.

## Project Snapshot

- App: Multi-person calorie tracking (meals, people/goals, recipes/cooking).
- Frontend: TanStack Start + React 19 + TypeScript + Vite.
- Styling/UI: Tailwind CSS v4, shadcn/ui.
- Backend: Convex (`convex/schema.ts`, mutation logic in `convex/nutrition.ts`, bounded domain queries in `convex/{catalog,cooking,history,meals,people,recipes}.ts`).
- Auth: Clerk.
- Package manager/runtime: pnpm + Node.js 24.

## Required Environment

Create `.env.local` with:

- `VITE_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `VITE_CLERK_PUBLISHABLE_KEY`

Convex-backed UI depends on `VITE_CONVEX_URL`. Clerk UI depends on `VITE_CLERK_PUBLISHABLE_KEY`.
For auth to Convex, Clerk must expose a JWT template named `convex` (audience `convex`).

## Hard Rules

- Validate and sanitize inputs in mutations/queries (trim strings, assert positive numbers, enforce required fields).
- Preserve historical data behavior: archive when records are referenced; only hard-delete when safe.
- For auth-protected data paths, call `requireAuthenticatedUser`.
- Use indexed queries where indices exist; add schema indices for new access patterns.
- Do not hand-edit generated files:
  - `convex/_generated/*`
  - `src/routeTree.gen.ts`
- Keep `components.json` conventions intact when adding shadcn components.

## Convex Migrations

When schema/validator changes may conflict with existing production data, use expand-migrate-contract:

1. Expand:
   - Deploy compatibility code first.
   - Run `pnpm exec convex deploy`.
2. Migrate:
   - Run one-off migration functions on prod.
   - Example: `pnpm exec convex run --prod <module:function> '{}'`.
   - Important: new migration functions are not runnable until after they are deployed.
3. Contract:
   - Remove temporary compatibility code and one-off migration functions.
   - Run `pnpm exec convex deploy` again.

Migration conventions:

- Prefer `internalMutation`/`internalAction` for one-off migrations.
- Make migrations idempotent when practical.
- Remove migration code after successful production execution.

## Codebase Map

- `src/components/ui/*`: Shared UI primitives (shadcn-style components).
- `src/integrations/*`: Integration config/providers (Clerk, Convex).
- `src/router.tsx`, `src/routes/__root.tsx`: Router/root shell composition.
- `convex/schema.ts`: Database schema.
- `convex/nutrition.ts`: Authenticated domain mutations and shared write invariants.
- `convex/{catalog,cooking,history,meals,people,recipes}.ts`: Bounded, owner-scoped domain queries.

## Local Commands

- Install deps: `pnpm install`
- Run app: `pnpm run dev` (Vite on port `3000`)
- Build: `pnpm run build`
- Preview build: `pnpm run preview`
- Lint: `pnpm run lint`
- Lint autofix: `pnpm run lint:fix`
- Type check: `pnpm run typecheck`
- Tests: `pnpm run test`
- Convex dev (separate terminal): `pnpm exec convex dev`

## Validation Before Handoff

For non-trivial edits, run:

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run test`
4. `pnpm run build`

CI additionally enforces `pnpm run format:check`, coverage thresholds, and the Playwright browser smoke test.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
