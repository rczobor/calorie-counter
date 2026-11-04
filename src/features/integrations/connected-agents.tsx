import { LoadingRows } from '@/components/page/loading-content'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { LoggingPreferences } from './logging-preferences'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { toErrorMessage } from '@/lib/nutrition'

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
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <div>
        <SettingsBreadcrumbs current="ChatGPT" />
        <h1 className="mt-5 text-xl font-semibold tracking-tight">ChatGPT</h1>
      </div>
      {configuration === undefined || configuration.enabled ? (
        <section aria-labelledby="connections-title">
          <h2 id="connections-title" className="mb-3 text-sm font-semibold">
            Connections
          </h2>
          <div className="divide-y border-y border-border/60">
            {connections === undefined ? (
              <LoadingRows label="Loading connected agents" rows={1} />
            ) : connections.length === 0 ? (
              <p>No agents connected.</p>
            ) : (
              connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <p className="min-w-0 break-words text-sm font-medium">
                    {connection.name}
                  </p>
                  <div className="flex flex-wrap items-start gap-2">
                    <details className="text-xs text-muted-foreground">
                      <summary className="min-h-9 cursor-pointer py-2.5">
                        Permissions
                      </summary>
                      <ul className="space-y-2 pb-2">
                        {connection.scopes.map((scope) => (
                          <li key={scope}>
                            <p>{scopeLabel(scope)}</p>
                            <code className="break-all text-[11px]">
                              {scope}
                            </code>
                          </li>
                        ))}
                      </ul>
                    </details>
                    <Button
                      variant="outline"
                      disabled={pending !== null}
                      onClick={() => setDisconnecting(connection)}
                    >
                      {pending === connection.id
                        ? 'Disconnecting…'
                        : 'Disconnect'}
                    </Button>
                  </div>
                </div>
              ))
            )}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      <LoggingPreferences />
      <details
        open={configuration?.enabled === false || connections?.length === 0}
        className="border-t border-border/60 pt-4"
      >
        <summary className="cursor-pointer text-sm font-medium">
          Connection setup
        </summary>
        <div className="mt-4 space-y-4 text-sm">
          {configuration === undefined ? (
            <LoadingRows label="Loading integration settings" rows={2} />
          ) : !configuration.enabled ? (
            <p>
              The ChatGPT integration has not been enabled for this deployment.
            </p>
          ) : (
            <>
              <p
                className="break-all rounded-md border bg-muted p-3 font-mono text-sm"
                aria-label="MCP server URL"
              >
                {configuration.url}
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>In ChatGPT Plugins, choose Add custom MCP server.</li>
                <li>Paste this URL and select OAuth authentication.</li>
                <li>
                  Choose permissions, sign in to Calorie Counter, and review the
                  connection request.
                </li>
                <li>
                  Enable the integration in a conversation and describe your
                  meal or cooking.
                </li>
              </ol>
              <p className="text-sm text-muted-foreground">
                Availability depends on your ChatGPT account and workspace
                settings. To connect with read-only access, request only
                nutrition:read. Recording meals or cooking also requires its
                write permission.
              </p>
              <p className="text-sm text-muted-foreground">
                Food names, portions, and nutrition data returned by the tools
                are shared with ChatGPT. Review estimates and portions before
                saving or correcting a meal. Use Calorie Counter to replace or
                remove foods.
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
    </main>
  )
}
