import { createFileRoute } from '@tanstack/react-router'
import { UsageDashboard } from '@/features/admin/usage-dashboard'

export const Route = createFileRoute('/settings/usage')({
  ssr: false,
  component: UsageDashboard,
})
