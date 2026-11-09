import { createFileRoute } from '@tanstack/react-router'
import { HomeScreenWidget } from '@/features/widget/home-screen-widget'

export const Route = createFileRoute('/settings/widget')({
  ssr: false,
  component: HomeScreenWidget,
})
