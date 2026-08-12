# ADR 0001: Keep TanStack Start with client-only feature routes

- Status: Accepted
- Date: 2026-08-09

## Context

The application uses TanStack Start, but its authenticated feature routes get
their identity from Clerk and their live application data from Convex React
subscriptions. Those routes do not currently use server loaders or server
functions, and rendering them on the server would add a second authentication
and data-loading path without improving the signed-in experience.

## Decision

Keep TanStack Start as the routing and build framework. Authenticated feature
routes remain explicitly configured with `ssr: false`; Clerk and Convex
providers initialize in the browser, and Convex remains the only application
data access layer.

Do not add server loaders merely to justify the framework choice. TanStack
Start is retained for its file-based routing, build integration, and a clear
path to public or server-rendered routes if the product later needs them.

## Consequences

- Signed-in routes display their deliberate loading states while Clerk and
  Convex initialize.
- Feature code must not depend on browser globals during module evaluation, so
  builds and route generation remain deterministic.
- Public, SEO-sensitive, or server-owned flows require a new ADR before
  enabling SSR and defining the corresponding server authentication boundary.
- Dependencies intended only for React Query SSR integration are unnecessary.
