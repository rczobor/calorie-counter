import { createFileRoute } from '@tanstack/react-router'
import { ConnectionConsent } from '@/features/integrations/connection-consent'

export const Route = createFileRoute('/connect')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    request:
      typeof search.request === 'string' && search.request.length <= 200
        ? search.request
        : '',
  }),
  component: ConnectPage,
})

function ConnectPage() {
  const { request } = Route.useSearch()
  return <ConnectionConsent requestId={request} />
}
