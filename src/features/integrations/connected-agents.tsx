import { LoadingRows } from '@/components/page/loading-content'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { LoggingPreferences } from './logging-preferences'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { PageShell } from '@/components/page/page-shell'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { toErrorMessage } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { messages } from './connected-agents.messages'

function scopeLabel(
  scope: string,
  labels: (typeof messages)[Locale]['scopes'],
) {
  switch (scope) {
    case 'nutrition:read':
      return labels.nutritionRead
    case 'meals:write':
      return labels.mealsWrite
    case 'cooking:write':
      return labels.cookingWrite
    default:
      return scope
  }
}

export function ConnectedAgents() {
  const t = useMessages(messages)
  const locale = useLocale()
  const configuration = useQuery(api.mcp.getConfiguration, {})
  const connections = useQuery(
    api.mcp.listConnections,
    configuration?.enabled ? {} : 'skip',
  )
  const revoke = useMutation(api.mcp.revokeConnection)
  const [pending, setPending] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<{
    id: string
    name: string
  } | null>(null)
  const [error, setError] = useState('')
  async function disconnect(id: string) {
    setPending(id)
    setError('')
    try {
      await revoke({ id })
    } catch (error) {
      setError(toErrorMessage(error, locale))
    } finally {
      setPending(null)
      setDisconnecting(null)
    }
  }
  return (
    <PageShell
      title={t.title}
      subtitle={t.intro}
      breadcrumbs={<SettingsBreadcrumbs current={t.title} />}
      contentClassName="max-w-3xl"
    >
      <div className="mt-6 space-y-8">
        {configuration === undefined || configuration.enabled ? (
          <section aria-labelledby="connections-title">
            <h2 id="connections-title" className="group-label">
              {t.connections}
            </h2>
            {connections === undefined ? (
              <LoadingRows
                label={t.loadingConnections}
                rows={1}
                className="inset-group px-4"
              />
            ) : (
              <RecordList label={t.connections} empty={t.noConnections}>
                {connections.map((connection) => (
                  <RecordRow
                    key={connection.id}
                    title={connection.name}
                    detail={
                      // Plain permissions stay visible; exact scope names are on demand.
                      <details className="group">
                        <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                          {connection.scopes
                            .map((scope) => scopeLabel(scope, t.scopes))
                            .join(' · ')}
                          <ChevronDown
                            aria-hidden="true"
                            className="size-3.5 transition-transform group-open:rotate-180"
                          />
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {connection.scopes.map((scope) => (
                            <li key={scope}>
                              <code className="text-[11px] break-all">
                                {scope}
                              </code>
                            </li>
                          ))}
                        </ul>
                      </details>
                    }
                    actions={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => setDisconnecting(connection)}
                      >
                        {pending === connection.id
                          ? t.disconnecting
                          : t.disconnect}
                      </Button>
                    }
                  />
                ))}
              </RecordList>
            )}
            {error ? (
              <p
                role="alert"
                className="mt-2 px-4 type-subhead text-destructive"
              >
                {error}
              </p>
            ) : null}
          </section>
        ) : null}
        <LoggingPreferences />
        <details
          open={configuration?.enabled === false || connections?.length === 0}
          className="group inset-group"
        >
          <summary
            className={cn(
              LIST_ROW_CLASS,
              'cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden',
            )}
          >
            {t.setup}
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="space-y-4 border-t px-4 pt-3 pb-4 type-subhead">
            {configuration === undefined ? (
              <LoadingRows label={t.loadingSetup} rows={2} />
            ) : !configuration.enabled ? (
              <p>{t.disabled}</p>
            ) : (
              <>
                <p
                  className="break-all rounded-lg bg-muted px-3.5 py-2.5 font-mono type-footnote"
                  aria-label={t.serverUrl}
                >
                  {configuration.url}
                </p>
                <Tabs defaultValue="chatgpt">
                  <TabsList aria-label={t.assistant}>
                    <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
                    <TabsTrigger value="claude">Claude</TabsTrigger>
                  </TabsList>
                  <TabsContent value="chatgpt" className="space-y-4 pt-2">
                    <ol className="list-decimal space-y-2 pl-5">
                      {t.chatgptSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <p className="text-muted-foreground">{t.chatgptNote}</p>
                  </TabsContent>
                  <TabsContent value="claude" className="space-y-4 pt-2">
                    <ol className="list-decimal space-y-2 pl-5">
                      {t.claudeSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <p className="text-muted-foreground">{t.claudeNote}</p>
                  </TabsContent>
                </Tabs>
                <p className="text-muted-foreground">{t.dataSharing}</p>
              </>
            )}
          </div>
        </details>
        <ConfirmDestructiveDialog
          open={disconnecting !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setDisconnecting(null)
          }}
          title={t.disconnectTitle(disconnecting?.name)}
          description={t.disconnectDescription}
          confirmLabel={t.disconnect}
          disabled={pending !== null}
          onConfirm={() => {
            if (disconnecting) void disconnect(disconnecting.id)
          }}
        />
      </div>
    </PageShell>
  )
}
