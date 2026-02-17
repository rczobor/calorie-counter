# AGENTS.md

Guidance for AI/code agents working in this repository.

## Project Snapshot

- App: Multi-person calorie tracking (meals, people/goals, recipes/cooking).
- Frontend: TanStack Start + React 19 + TypeScript + Vite.
- Styling/UI: Tailwind CSS v4, shadcn/ui (`new-york` style), `@base-ui/react`, `sonner`, `lucide-react`.
- Backend: Convex (`convex/schema.ts`, `convex/nutrition.ts`).
- Auth: Clerk (optional at runtime; app degrades with setup hints when missing).
- Package manager/runtime: Bun (`packageManager: bun@1.3.9`).

## Local Commands

- Install deps: `bun install`
- Run app: `bun run dev` (Vite on port `3000`)
- Build: `bun run build`
- Preview build: `bun run preview`
- Lint: `bun run lint`
- Lint autofix: `bun run lint:fix`
- Tests: `bun run test` (Vitest; currently no tests in repo)
- Convex dev (separate terminal): `bunx convex dev`

## Required Environment

Create `.env.local` with:

- `VITE_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `VITE_CLERK_PUBLISHABLE_KEY`

Convex-backed UI depends on `VITE_CONVEX_URL`. Clerk UI depends on `VITE_CLERK_PUBLISHABLE_KEY`.
For auth to Convex, Clerk must expose a JWT template named `convex` (audience `convex`), and Convex env must include `CLERK_JWT_ISSUER_DOMAIN`.

## Codebase Map

- `src/routes/*`: Route-level pages (`/`, `/people`, `/manage`) via TanStack file routes.
- `src/components/ui/*`: Shared UI primitives (shadcn-style components).
- `src/integrations/*`: Integration config/providers (Clerk, Convex).
- `src/router.tsx`, `src/routes/__root.tsx`: Router/root shell composition.
- `convex/schema.ts`: Database schema.
- `convex/nutrition.ts`: Main query/mutation domain logic.
- `convex/_generated/*`, `src/routeTree.gen.ts`: Generated files.

## Conventions To Follow

- TypeScript strict mode is enabled; keep types explicit where helpful.
- Use path alias `@/*` for `src/*` imports.
- Existing style is functional React components with hooks.
- Keep route-level UI in route files and reusable primitives in `src/components/ui`.
- Reuse existing utility patterns (`runAction`, `toErrorMessage`, `toLocalDateString`) when extending nearby code.
- Favor existing UI composition style: `Card` sections, `Button` variants/sizes, `Skeleton` for loading states, toast feedback via `sonner`.

## Convex Rules

- Validate and sanitize inputs in mutations/queries (trim strings, assert positive numbers, enforce required fields).
- Preserve historical data behavior: archive when records are referenced; only hard-delete when safe.
- Keep `createdAt` timestamps and snapshot fields consistent with existing patterns.
- For auth-protected data paths, call `requireAuthenticatedUser`.
- Use indexed queries where indices exist; if adding new access patterns, add appropriate schema indices.

## Generated / Managed Files

- Do not hand-edit generated files:
  - `convex/_generated/*`
  - `src/routeTree.gen.ts`
- Keep `components.json` conventions intact when adding shadcn components.

## Style Notes

- Frontend files currently mostly use single quotes and semicolon-free style.
- Some older files use double quotes/semicolons; preserve local file style when editing.
- Tailwind tokens and theme variables are centralized in `src/styles.css`; prefer extending there over one-off ad hoc theme changes.

## Validation Before Handoff

For non-trivial edits, run:

1. `bun run lint`
2. `bun run build`

If tests are added, run `bun run test` and report results.
