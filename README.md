# Calorie Counter App Shell

Project shell initialized with:
- TanStack Start (React, file-based routing)
- Convex (database integration scaffold)
- Clerk (auth integration scaffold)
- shadcn/ui (component setup + generated base components)
- Base UI (`@base-ui/react`) for headless primitives
- Tailwind CSS v4

## Run locally

```bash
bun install
bun run dev
```

## Environment variables needed

Set these in `.env.local`:

```bash
VITE_CLERK_PUBLISHABLE_KEY=
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=
```

Without them, the shell still renders, but auth/database demo routes stay disabled.

## What is included now

- App shell landing page for a calorie counter workflow (placeholder UI only).
- Header/navigation shared layout in `src/components/Header.tsx`.
- shadcn components generated: `button`, `card`, `input`.
- Base UI usage added via `src/components/base-ui/goal-lock-switch.tsx`.
- Convex + Clerk providers wired with safe fallbacks until env vars are provided.

## Next step after env setup

```bash
bunx convex dev
```

Then open:
- `/demo/clerk`
- `/demo/convex`
