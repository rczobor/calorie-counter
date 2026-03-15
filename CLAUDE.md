# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-person calorie tracking app. Users log meals, manage people with daily calorie goals, and maintain a catalog of recipes/ingredients/cooked foods. Built with TanStack Start (React 19 + file-based routing) on the frontend and Convex as the serverless backend, with optional Clerk authentication.

## Commands

- **Install**: `bun install`
- **Dev server**: `bun run dev` (port 3000) — also run `bunx convex dev` in a separate terminal
- **Build**: `bun run build`
- **Lint**: `bun run lint` / `bun run lint:fix`
- **Type check**: `bun run typecheck` (checks both app and convex)
- **Test**: `bun run test` (Vitest, jsdom env, files matching `src/**/*.test.{ts,tsx}`)
- **Format**: `bun run format` (Prettier: no semicolons, single quotes, trailing commas)
- **Add shadcn component**: `bunx --bun shadcn@latest add <component>`

Before submitting changes, run: `bun run lint && bun run typecheck && bun run build`

## Architecture

**Frontend** (`src/`):
- `routes/` — File-based TanStack Router pages. Route tree is auto-generated in `routeTree.gen.ts` (do not edit).
- `features/` — Feature modules organized by domain (cooking, manage, meals, people).
- `components/ui/` — Shared shadcn/ui primitives (style: `base-mira`, icons: `lucide-react`).
- `integrations/` — Provider config for Clerk (`clerk/`) and Convex (`convex/`).
- `lib/` — Shared utilities. Path alias: `@/*` maps to `./src/*`.

**Backend** (`convex/`):
- `schema.ts` — Database schema (tables: people, personGoalHistory, foodGroups, ingredients, recipes, recipeVersions, recipeVersionIngredients, cookSessions, cookedFoods, cookedFoodIngredients, meals, mealItems).
- `nutrition.ts` — Main query/mutation logic for the domain.
- `auth.config.ts` — Clerk JWT auth config for Convex.
- `_generated/` — Auto-generated Convex code (do not edit).

**Key patterns**:
- React Compiler is enabled via `@rolldown/plugin-babel` with `reactCompilerPreset`.
- `@convex-dev/react-query` bridges Convex with TanStack Query.
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`.

## Convex Conventions

- System fields `_id` and `_creationTime` are automatic — don't add them to schemas.
- Use `v.id("tableName")` for foreign keys, not raw strings.
- Use indexed queries where indices exist; add new indices in `schema.ts` for new access patterns.
- Auth-protected paths must call `requireAuthenticatedUser`.
- Preserve historical data: archive referenced records rather than hard-deleting.

### Schema Migrations (expand-migrate-contract)

1. **Expand**: Deploy compatibility code (`bunx convex deploy`)
2. **Migrate**: Run one-off `internalMutation`/`internalAction` on prod (`bunx convex run --prod <module:function> '{}'`)
3. **Contract**: Remove migration code and redeploy

## Environment Variables

Required in `.env.local`:
- `VITE_CONVEX_URL` — Convex deployment URL
- `CONVEX_DEPLOYMENT` — Convex deployment name
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (for auth UI)
