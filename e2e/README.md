# Browser smoke tests

`pnpm run test:e2e` starts Vite in the committed `e2e` mode and runs the real
dashboard route in Chromium. That mode sets `VITE_E2E_MOCKS=true`, bypasses the
external Clerk gate, and aliases only Convex's React transport to
`src/testing/e2e/convex-react-adapter.tsx`.

The adapter is deliberately narrow: it serves seeded data through the same
bounded domain queries as production (`people:list`, `catalog:listIngredients`,
`cooking:listSessions`, `cooking:listCookedFoodsForSession`,
`meals:listForDay`, `meals:getDaySummary`, and `meals:getDetail`). It supports
`nutrition:createMeal` for the browser flow. Unsupported queries return no data
and unsupported mutations fail with an explicit error. The browser still
exercises the real router, dashboard, form controls, table, toast, and
client-side calculations; it is not a separate test page.

The mock flag defaults to off, `.env.e2e` contains no secrets, and Vite refuses
to create a production build while the flag is enabled. Run live Clerk/Convex
integration checks separately against a disposable deployment.
