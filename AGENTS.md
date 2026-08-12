# Calorie Counter

Calorie Counter is an authenticated, multi-person nutrition tracker. People can
set changing calorie goals, log meals, maintain a shared food catalog, version
recipes, record cooking batches, and inspect their history.

The app uses TanStack Start and React 19 on the frontend, Convex for live data
and domain logic, and Clerk for identity. Authenticated feature routes render on
the client and subscribe directly to Convex; the reasoning is recorded in
`docs/adr/0001-client-only-tanstack-start.md`.

## What must stay true?

These are the product invariants to protect while the implementation evolves.

### 1. History is evidence

A past meal should continue to mean what it meant when it was recorded. Archive
referenced people, catalog entries, recipes, and cooked foods instead of
silently erasing them. Recipe versions and goal history exist so later edits do
not rewrite the past. Hard-delete only when the existing domain rules prove it
is safe.

### 2. Every account owns its data

All protected Convex paths authenticate with `requireAuthenticatedUser` and
scope reads, writes, searches, and related-record lookups to the authenticated
owner. A document ID supplied by the client is never authorization by itself.
Validate ownership again when following relationships between documents.

### 3. Nutrition math is predictable

Calories, quantities, serving units, dates, goals, and daily summaries form one
domain model. Reuse the nearby nutrition and validation helpers instead of
reimplementing their rules in a component or endpoint. When a write affects a
derived total, update and test the whole invariant rather than only the visible
field.

### 4. Repeated tasks should feel obvious

Logging a meal and reusing catalog or cooking data are everyday workflows. Keep
their paths short, preserve useful defaults, and make pending, empty, error, and
destructive states explicit. Maintain keyboard access, labels, focus behavior,
and confirmation for consequential actions.

## How to work here

Understand the real data flow before editing, then make the smallest change
that keeps the invariants above unsurprising. Reuse nearby code, platform
features, and installed dependencies before adding another abstraction or
package. Do not preserve complexity merely because it already exists, and do
not build speculative machinery for a future requirement.

Treat the guidance below as strong defaults. If a task genuinely conflicts
with one of them, surface the tradeoff instead of quietly working around it.

## A small glossary

Use these terms consistently in code and conversation:

- **owner**: the authenticated Clerk/Convex identity that owns a complete data
  set.
- **person**: someone whose meals and calorie goals are tracked within an
  owner's data.
- **catalog**: reusable food groups, ingredients, and recipes.
- **recipe version**: an immutable historical composition of a recipe.
- **cook session**: one cooking event that produces one or more cooked foods.
- **cooked food**: a reusable output from a cook session, with its ingredient
  composition preserved.
- **meal**: food logged for one person on one calendar date.
- **daily summary**: derived per-person totals for one date.

## The three easiest ways to break the app

1. **Deleting history.** Removing a referenced record can make old meals or
   nutrition totals lie. Follow existing archive and reference checks; do not
   replace them with unconditional deletes.
2. **Trusting a foreign ID.** Queries and mutations must reject related records
   from another owner even when their IDs are valid. Authenticate, scope the
   initial lookup, and verify every referenced document.
3. **Contracting a schema too early.** Existing Convex documents may still have
   the old shape. Deploy compatibility code before backfilling or tightening a
   validator, and do not assume a migration function exists in production
   before it has been deployed.

## Follow a change through every layer

The most common incomplete change is one that updates the screen but misses a
write invariant, a derived summary, or another route that exposes the same
data. Before calling a feature complete, consider each applicable layer:

- **Input boundary.** Trim strings, enforce required fields, assert positive or
  otherwise bounded numbers, and validate dates and units.
- **Authorization.** Require an authenticated user and keep every lookup
  owner-scoped.
- **Write model.** Preserve archive, versioning, reference, and summary
  invariants in Convex rather than relying on the UI.
- **Read model.** Use an existing index when one matches. Add a schema index for
  a new access pattern instead of filtering an unbounded table.
- **User surfaces.** Check the dashboard, people, catalog, cooking, and history
  routes wherever the changed concept appears.
- **Reverse state.** If something can be archived, selected, edited, or locked,
  make its recovery and current state understandable.
- **Tests.** Prove the changed behavior at the narrowest layer that owns it,
  then cover integration boundaries when the behavior crosses them.

## How it works

TanStack Start supplies the application shell and file-based routing.
Authenticated React routes subscribe to owner-scoped Convex queries and invoke
Convex mutations. Clerk issues the `convex` JWT used to establish identity.
Convex owns validation, authorization, historical references, recipe versions,
cooking composition, meals, and daily summaries; the frontend owns interaction
state and presentation, not trust-boundary rules.

## Where code lives

- `src/routes/*`: Route composition and route-level loading, empty, and error
  states.
- `src/features/*`: Feature UI and client-side domain adapters for meals,
  people, catalog management, and cooking.
- `src/components/ui/*`: Shared shadcn-style primitives. Keep
  `components.json` conventions intact when adding components.
- `src/components/nutrition/*`: Reusable nutrition-entry controls.
- `src/integrations/{clerk,convex}/*`: Identity and data-provider setup.
- `src/lib/*`: Small shared client-side domain helpers.
- `convex/schema.ts`: Tables and indexes.
- `convex/validators.ts`: Shared persisted and input shapes.
- `convex/nutrition.ts`: Authenticated mutations and shared write invariants.
- `convex/{catalog,cooking,history,meals,people,recipes}.ts`: Bounded,
  owner-scoped domain queries.
- `convex/lib/*`: Shared backend authentication and validation helpers.
- `scripts/*`: Explicit operational tooling such as seeding and export
  transformation.
- `docs/adr/*`: Architectural decisions and the conditions for revisiting them.

Never hand-edit generated files under `convex/_generated/*` or
`src/routeTree.gen.ts`.

## Convex migrations

When a schema or validator change may conflict with existing documents, use
expand-migrate-contract:

1. **Expand.** Deploy compatibility code first with
   `pnpm exec convex deploy`.
2. **Migrate.** Run the one-off production migration, for example
   `pnpm exec convex run --prod <module:function> '{}'`. New migration
   functions are not callable until the expand deploy finishes.
3. **Contract.** Remove compatibility code and the one-off migration, then
   deploy again.

Prefer `internalMutation` or `internalAction` for one-off migrations, make them
idempotent when practical, and remove them after successful execution. For a
breaking export-transform-restore operation, follow the maintenance and
rollback runbook in `README.md`; never improvise against production.

## Local development

Use pnpm with the repository's declared Node.js version. Create `.env.local`
with:

- `VITE_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `VITE_CLERK_PUBLISHABLE_KEY`

Clerk must expose a JWT template named `convex` with audience `convex`, and the
selected Convex deployment needs its Clerk issuer configuration.

Common commands:

- `pnpm install` - install dependencies.
- `pnpm exec convex dev` - run Convex in a separate terminal.
- `pnpm run dev` - start Vite on port `3000`.
- `pnpm run lint` / `pnpm run lint:fix` - check or fix lint errors.
- `pnpm run typecheck` - type-check the app and Convex backend.
- `pnpm run test` - run the Vitest suites.
- `pnpm run build` - build the client and SSR bundles.
- `pnpm run test:e2e` - run the mocked authenticated Playwright smoke test.

## Verifying

Start with the smallest proof that exercises the changed behavior. Add or
update focused tests for backend invariants and user-visible behavior; do not
duplicate coverage merely to preserve an implementation detail.

For non-trivial edits, run before handoff:

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run test`
4. `pnpm run build`

CI also enforces `pnpm run format:check`, coverage thresholds, and the
Playwright browser smoke test.

## Pull requests

- Do not commit, push, open a pull request, or merge unless the user asks.
- Follow the repository's title convention. Prefer a plain-language
  Conventional Commit title when one applies.
- Start the description with the problem, then briefly explain the solution.
- Rebase onto the latest base branch before opening unless repository rules or
  the user say otherwise.
- Keep one concern per pull request. User-visible UI changes should include
  before/after evidence when practical.

## Taste

- Prefer inferred TypeScript types. Avoid `any`; narrow `unknown`, model states
  explicitly, and let types flow from validators and APIs.
- Keep domain invariants in Convex and interaction details in React. Do not make
  a component responsible for security or data integrity.
- Prefer indexed, bounded reads over broad queries followed by filtering.
- Keep components and helpers local until reuse is real. A small duplication is
  often cheaper than a premature framework.
- Comments explain non-obvious contracts, reasons, or workarounds. They move or
  disappear when the behavior does.
- Preserve error handling that prevents data loss, validation at trust
  boundaries, and accessibility basics even when simplifying code.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
