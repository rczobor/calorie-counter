# AGENTS.md

Minimal guidance for AI/code agents working in this repository.

## Project Snapshot

- App: Multi-person calorie tracking (meals, people/goals, recipes/cooking).
- Frontend: TanStack Start + React 19 + TypeScript + Vite.
- Styling/UI: Tailwind CSS v4, shadcn/ui.
- Backend: Convex (`convex/schema.ts`, `convex/nutrition.ts`).
- Auth: Clerk.
- Package manager/runtime: Bun.

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

## Codebase Map

- `src/components/ui/*`: Shared UI primitives (shadcn-style components).
- `src/integrations/*`: Integration config/providers (Clerk, Convex).
- `src/router.tsx`, `src/routes/__root.tsx`: Router/root shell composition.
- `convex/schema.ts`: Database schema.
- `convex/nutrition.ts`: Main query/mutation domain logic.

## Local Commands

- Install deps: `bun install`
- Run app: `bun run dev` (Vite on port `3000`)
- Build: `bun run build`
- Preview build: `bun run preview`
- Lint: `bun run lint`
- Lint autofix: `bun run lint:fix`
- Tests: `bun run test` (Vitest; currently no tests in repo)
- Convex dev (separate terminal): `bunx convex dev`

## Validation Before Handoff

For non-trivial edits, run:
1. `bun run lint`
2. `bun run build`

If tests are added or changed, run `bun run test`.
