import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toErrorMessage } from '@/lib/nutrition'

function readInvitationToken() {
  return typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '')
}

// Joining is account-level: it must also work after the account leaves its last household.
export function HouseholdInvitation({
  onJoined,
}: {
  onJoined?: (id: Id<'households'>) => void
}) {
  const [token, setToken] = useState(readInvitationToken)
  useEffect(() => {
    const updateToken = () => setToken(readInvitationToken())
    window.addEventListener('hashchange', updateToken)
    return () => window.removeEventListener('hashchange', updateToken)
  }, [])
  const [now] = useState(Date.now)
  const invitation = useQuery(
    api.households.inspectInvitation,
    token ? { token, now } : 'skip',
  )
  const accept = useMutation(api.households.acceptInvitation)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  if (!token) return null

  async function join() {
    setPending(true)
    setError('')
    try {
      const id = await accept({ token })
      const url = new URL(window.location.href)
      url.hash = ''
      window.history.replaceState(null, '', url)
      setToken('')
      onJoined?.(id)
    } catch (error) {
      setError(toErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household invitation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        {invitation === undefined ? (
          <p role="status">Loading invitation…</p>
        ) : !invitation ? (
          <p>This invitation has expired, was revoked, or was already used.</p>
        ) : (
          <>
            <p>
              Join <strong>{invitation.name}</strong>?
            </p>
            <p>
              Joining gives you access to all of this household’s nutrition
              data, including everyone’s past meals and goals. Members can
              manage the shared data. Your existing household stays separate.
            </p>
            <Button disabled={pending} onClick={() => void join()}>
              Join household
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
