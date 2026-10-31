import { createFileRoute } from '@tanstack/react-router'
import { HouseholdSettings } from '@/features/households/household-settings'

export const Route = createFileRoute('/household')({
  ssr: false,
  component: HouseholdSettings,
})
