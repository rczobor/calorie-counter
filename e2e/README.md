# Browser smoke tests

`pnpm run test:e2e` starts Vite in the committed `e2e` mode and runs the real
dashboard route in Chromium. That mode sets `VITE_E2E_MOCKS=true`, bypasses the
external Clerk gate, and aliases only Convex's React transport to
`src/testing/e2e/convex-react-adapter.tsx`.

The adapter is deliberately narrow: it serves seeded data through the same
bounded domain queries as production (`people:list`, `catalog:listIngredients`,
`cooking:listSessions`, `cooking:listCookedFoodsForSession`,
`meals:listForDay`, `meals:getDaySummary`, and `meals:getDetail`). It also serves two synthetic households and people, household membership
settings, and the bootstrap mutation. It supports `nutrition:createMeal` for
the browser flow. Household tests verify device selections and draft isolation
across switching and refresh; backend tests cover actual membership and data
isolation. Unsupported queries return no data
and unsupported mutations fail with an explicit error. The browser still
exercises the real router, dashboard, form controls, table, toast, and
client-side calculations; it is not a separate test page.

The mock flag defaults to off, `.env.e2e` contains no secrets, and Vite refuses
to create a production build while the flag is enabled. Run live Clerk/Convex
integration checks separately against a disposable deployment.

## Run and review

Use the Node version declared in `package.json`, then run
`pnpm run setup:worktree`. The frozen install preserves the lockfile and needs
no environment file. Install Chromium once when missing with
`pnpm exec playwright install chromium`.

`pnpm run test:e2e` uses one worker in both local and CI runs. A setup project
waits for the hydrated, seeded app before the workflow tests start, separating
cold compilation failures from normal five-second UI assertions. Playwright
starts and stops its own server and refuses to reuse an occupied port. Run a
focused flow with `pnpm run test:e2e -- e2e/layout.spec.ts`.

For visual iteration, `pnpm run dev:e2e` serves these same real components and
synthetic households at `http://127.0.0.1:4173/`. Stop that manual server before
running the browser suite. Review light/dark mode, desktop/mobile layouts, and
the affected empty, loading, and error states. Share evidence through the
reviewer's supported surface; a host-local path alone is insufficient on a
remote device. No separate design-only implementation is needed.
