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

function scopeLabel(scope: string) {
  switch (scope) {
    case 'nutrition:read':
      return 'Read nutrition'
    case 'meals:write':
      return 'Log meals'
    case 'cooking:write':
      return 'Record cooking'
    default:
      return scope
  }
}

export function ConnectedAgents() {
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
      setError(toErrorMessage(error))
    } finally {
      setPending(null)
      setDisconnecting(null)
    }
  }
  return (
    <PageShell
      title="AI assistants"
      subtitle="Log meals and cooking by chatting with ChatGPT or Claude."
      breadcrumbs={<SettingsBreadcrumbs current="AI assistants" />}
      contentClassName="max-w-3xl"
    >
      <div className="mt-6 space-y-8">
        {configuration === undefined || configuration.enabled ? (
          <section aria-labelledby="connections-title">
            <h2 id="connections-title" className="group-label">
              Connections
            </h2>
            {connections === undefined ? (
              <LoadingRows
                label="Loading connected agents"
                rows={1}
                className="inset-group px-4"
              />
            ) : (
              <RecordList label="Connections" empty="No assistants connected.">
                {connections.map((connection) => (
                  <RecordRow
                    key={connection.id}
                    title={connection.name}
                    detail={
                      // Plain permissions stay visible; exact scope names are on demand.
                      <details className="group">
                        <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                          {connection.scopes.map(scopeLabel).join(' · ')}
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
                          ? 'Disconnecting…'
                          : 'Disconnect'}
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
            Connection setup
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="space-y-4 border-t px-4 pt-3 pb-4 type-subhead">
            {configuration === undefined ? (
              <LoadingRows label="Loading integration settings" rows={2} />
            ) : !configuration.enabled ? (
              <p>
                AI assistant connections have not been enabled for this
                deployment.
              </p>
            ) : (
              <>
                <p
                  className="break-all rounded-lg bg-muted px-3.5 py-2.5 font-mono type-footnote"
                  aria-label="MCP server URL"
                >
                  {configuration.url}
                </p>
                <Tabs defaultValue="chatgpt">
                  <TabsList aria-label="Assistant">
                    <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
                    <TabsTrigger value="claude">Claude</TabsTrigger>
                  </TabsList>
                  <TabsContent value="chatgpt" className="space-y-4 pt-2">
                    <ol className="list-decimal space-y-2 pl-5">
                      <li>In ChatGPT Plugins, choose Add custom MCP server.</li>
                      <li>Paste this URL and select OAuth authentication.</li>
                      <li>
                        Choose permissions, sign in to Calorie Counter, and
                        review the connection request.
                      </li>
                      <li>
                        Enable the integration in a conversation and describe
                        your meal or cooking.
                      </li>
                    </ol>
                    <p className="text-muted-foreground">
                      Availability depends on your ChatGPT account and workspace
                      settings. To connect with read-only access, request only
                      nutrition:read. Recording meals or cooking also requires
                      its write permission.
                    </p>
                  </TabsContent>
                  <TabsContent value="claude" className="space-y-4 pt-2">
                    <ol className="list-decimal space-y-2 pl-5">
                      <li>
                        In Claude, open Customize, then Connectors, and choose
                        Add custom connector.
                      </li>
                      <li>
                        Paste this URL, keep the default sign-in settings, and
                        add the connector.
                      </li>
                      <li>
                        Select Connect, sign in to Calorie Counter, and review
                        the connection request.
                      </li>
                      <li>
                        In a conversation, turn the connector on from the + menu
                        under Connectors, then describe your meal or cooking.
                      </li>
                    </ol>
                    <p className="text-muted-foreground">
                      On Team and Enterprise plans, an organization Owner first
                      adds the connector in Organization settings, then
                      Connectors. Each member then connects it from Customize,
                      then Connectors.
                    </p>
                  </TabsContent>
                </Tabs>
                <p className="text-muted-foreground">
                  Food names, portions, and nutrition data returned by the tools
                  are shared with the assistant you connect. Review estimates
                  and portions before saving or correcting a meal. Use Calorie
                  Counter to replace or remove foods.
                </p>
              </>
            )}
          </div>
        </details>
        <ConfirmDestructiveDialog
          open={disconnecting !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setDisconnecting(null)
          }}
          title={`Disconnect ${disconnecting?.name ?? 'connection'}?`}
          description="This connection will lose access. Recorded meals and cooking will remain."
          confirmLabel="Disconnect"
          disabled={pending !== null}
          onConfirm={() => {
            if (disconnecting) void disconnect(disconnecting.id)
          }}
        />
      </div>
    </PageShell>
  )
}
