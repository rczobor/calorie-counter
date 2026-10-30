import { useMutation, useQuery } from 'convex/react'
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

export function ConnectedAgents() {
  const configuration = useQuery(api.mcp.getConfiguration, {})
  const connections = useQuery(
    api.mcp.listConnections,
    configuration?.enabled ? {} : 'skip',
  )
  const revoke = useMutation(api.mcp.revokeConnection)
  const [pending, setPending] = useState<string | null>(null)
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
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect ChatGPT to your meals and cooking.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ChatGPT connection</CardTitle>
          <CardDescription>
            ChatGPT uses its own model to work with the tools you authorize.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {configuration === undefined ? (
            <p role="status">Loading integration settings…</p>
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
        </CardContent>
      </Card>
      {configuration?.enabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Connected agents</CardTitle>
            <CardDescription>
              Disconnecting removes this agent’s access. Recorded meals and
              cooking remain in your history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connections === undefined ? (
              <p role="status">Loading connected agents…</p>
            ) : connections.length === 0 ? (
              <p>No agents connected.</p>
            ) : (
              connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{connection.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {connection.scopes.join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => void disconnect(connection.id)}
                  >
                    {pending === connection.id
                      ? 'Disconnecting…'
                      : 'Disconnect'}
                  </Button>
                </div>
              ))
            )}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}
