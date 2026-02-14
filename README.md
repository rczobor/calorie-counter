# Calorie Counter

A multi-person calorie tracking app built with TanStack Start + Convex, with optional Clerk auth.

## Stack

- TanStack Start (React 19 + file-based TanStack Router)
- Vite + TypeScript
- Tailwind CSS v4
- shadcn/ui + `@base-ui/react` primitives
- Convex (backend, schema, queries, mutations)
- Clerk (optional auth UI)

## App Routes

- `/`: Meal dashboard for logging meals, editing entries, and tracking daily target/consumed/remaining calories.
- `/people`: People management with daily goal updates and goal history.
- `/manage`: Catalog/cooking management for food groups, ingredients, recipes, cook sessions, and cooked foods.

## Convex Domain Model

The Convex schema currently includes:
- `people`, `personGoalHistory`
- `foodGroups`, `ingredients`
- `recipes`, `recipeVersions`, `recipeVersionIngredients`
- `cookSessions`, `cookedFoods`, `cookedFoodIngredients`
- `meals`, `mealItems`

Main backend logic lives in `convex/nutrition.ts`.

## Local Setup

1. Install dependencies.

```bash
bun install
```

2. Create `.env.local`.

```bash
VITE_CONVEX_URL=
CONVEX_DEPLOYMENT=
VITE_CLERK_PUBLISHABLE_KEY=
```

Convex-backed routes require `VITE_CONVEX_URL` (and usually `CONVEX_DEPLOYMENT` for Convex tooling). Clerk UI requires `VITE_CLERK_PUBLISHABLE_KEY`. If env vars are missing, the app still renders and shows integration hints/fallback UI.

3. Start Convex in a separate terminal.

```bash
bunx convex dev
```

4. Start the app.

```bash
bun run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## Scripts

- `bun run dev`: Start local dev server (port `3000`)
- `bun run build`: Production build (client + SSR bundles)
- `bun run preview`: Preview production build
- `bun run lint`: Run ESLint
- `bun run lint:fix`: Run ESLint with autofix
- `bun run test`: Run Vitest (currently exits with code `1` because no test files exist yet)
