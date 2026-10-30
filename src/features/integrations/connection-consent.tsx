import { useAction, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toErrorMessage } from '@/lib/nutrition'

export function ConnectionConsent({ requestId }: { requestId: string }) {
  const request = useQuery(
    api.mcp.getAuthRequest,
    requestId ? { requestId } : 'skip',
  )
  const authorize = useAction(api.mcp.authorize)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const framed = typeof window !== 'undefined' && window.top !== window.self

  async function decide(approve: boolean) {
    setPending(true)
    setError('')
    try {
      const result = await authorize({ requestId, approve })
      if (result.redirectUrl) window.location.assign(result.redirectUrl)
      else setFinished(true)
    } catch (error) {
      setError(toErrorMessage(error))
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Connect an AI assistant</CardTitle>
          <CardDescription>
            Grant access to your Calorie Counter account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {framed ? (
            <p>Open this page directly to approve a connection.</p>
          ) : finished ? (
            <p>You can return to your assistant.</p>
          ) : !requestId ? (
            <p>
              Start the connection from ChatGPT using the MCP URL in
              Integrations settings.
            </p>
          ) : request === undefined ? (
            <p role="status">Loading connection request…</p>
          ) : !request || request.status !== 'pending' ? (
            <p>
              This request has expired or was already handled. Start again from
              your assistant.
            </p>
          ) : request.kind !== 'redirect' ? (
            <p>
              This connection method is not enabled. Start a browser OAuth
              connection from ChatGPT.
            </p>
          ) : (
            <>
              <p>
                Client name (unverified): <strong>{request.clientName}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Approve only a connection you started. The client supplies its
                name; it has not been verified by Calorie Counter.
              </p>
              {request.redirectUri ? (
                <div className="break-all text-sm">
                  <p>
                    Return to:{' '}
                    <strong>{new URL(request.redirectUri).host}</strong>
                  </p>
                  <details>
                    <summary>Full return address</summary>
                    {request.redirectUri}
                  </details>
                  {['localhost', '127.0.0.1', '[::1]'].includes(
                    new URL(request.redirectUri).hostname,
                  ) ? (
                    <p>
                      A local application will receive this connection. Approve
                      only if you started it.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <ul className="list-disc space-y-1 pl-5">
                {request.scopes.map((scope) => (
                  <li key={scope.name}>{scope.description}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                The assistant will receive food and nutrition data needed for
                your requests. You can disconnect it in Integrations settings.
              </p>
              <div className="flex gap-2">
                <Button disabled={pending} onClick={() => void decide(true)}>
                  Allow access
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void decide(false)}
                >
                  Deny
                </Button>
              </div>
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
