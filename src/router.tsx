import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { AppPending } from './components/app-pending'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPendingComponent: AppPending,
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
