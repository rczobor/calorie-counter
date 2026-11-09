import { createFileRoute } from '@tanstack/react-router'
import { PrivacyNotice } from '@/features/privacy/privacy-notice'

export const Route = createFileRoute('/privacy')({
  ssr: false,
  component: PrivacyNotice,
})
