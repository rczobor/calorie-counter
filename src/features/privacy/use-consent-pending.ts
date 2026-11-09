import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { isClerkConfigured } from '@/integrations/clerk/config'
import { isConvexConfigured } from '@/integrations/convex/config'
import { isE2eMockMode } from '@/testing/e2e/config'

function useConsentQueryPending() {
  const { isAuthenticated } = useConvexAuth()
  // ConsentGate holds the same subscription, so this costs no extra request.
  const consent = useQuery(api.privacy.consent, isAuthenticated ? {} : 'skip')
  return consent?.accepted === false
}

/**
 * Whether the consent screen is up, for the navigation outside it: no tab
 * reads as current while the app waits for consent. Without a Convex auth
 * provider there is no consent to wait for; the choice is fixed per build.
 */
export const useConsentPending =
  isE2eMockMode || (isConvexConfigured && isClerkConfigured)
    ? useConsentQueryPending
    : () => false
