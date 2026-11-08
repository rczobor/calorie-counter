import { LoadingRows } from '@/components/page/loading-content'
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
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { messages } from './connection-consent.messages'

export function ConnectionConsent({ requestId }: { requestId: string }) {
  const t = useMessages(messages)
  const locale = useLocale()
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
      setError(toErrorMessage(error, locale))
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {framed ? (
            <p>{t.framed}</p>
          ) : finished ? (
            <p>{t.finished}</p>
          ) : !requestId ? (
            <p>{t.noRequest}</p>
          ) : request === undefined ? (
            <LoadingRows label={t.loading} rows={2} />
          ) : !request || request.status !== 'pending' ? (
            <p>{t.expired}</p>
          ) : request.kind !== 'redirect' ? (
            <p>{t.unsupported}</p>
          ) : (
            <>
              <p>
                {t.clientName} <strong>{request.clientName}</strong>
              </p>
              <p className="text-sm text-muted-foreground">{t.clientWarning}</p>
              {request.redirectUri ? (
                <div className="break-all text-sm">
                  <p>
                    {t.returnTo}{' '}
                    <strong>{new URL(request.redirectUri).host}</strong>
                  </p>
                  <details>
                    <summary>{t.fullReturnAddress}</summary>
                    {request.redirectUri}
                  </details>
                  {['localhost', '127.0.0.1', '[::1]'].includes(
                    new URL(request.redirectUri).hostname,
                  ) ? (
                    <p>{t.localApplication}</p>
                  ) : null}
                </div>
              ) : null}
              <ul className="list-disc space-y-1 pl-5">
                {request.scopes.map((scope) => (
                  <li key={scope.name}>{t.scopeDescription(scope)}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">{t.accessSummary}</p>
              <div className="flex gap-2">
                <Button disabled={pending} onClick={() => void decide(true)}>
                  {t.allow}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void decide(false)}
                >
                  {t.deny}
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
