import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { PagePlaceholder } from './components/page/page-placeholder'
import { RouteErrorState } from './components/page/page-states'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPendingComponent: PagePlaceholder,
    defaultErrorComponent: RouteErrorState,
    defaultPendingMs: 350,
    defaultPendingMinMs: 250,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
