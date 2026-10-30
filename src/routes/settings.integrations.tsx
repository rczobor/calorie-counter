import { createFileRoute } from '@tanstack/react-router'
import { ConnectedAgents } from '@/features/integrations/connected-agents'

export const Route = createFileRoute('/settings/integrations')({
  ssr: false,
  component: ConnectedAgents,
})
