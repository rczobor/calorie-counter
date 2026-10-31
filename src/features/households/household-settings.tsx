import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useHousehold } from './household-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { toErrorMessage } from '@/lib/nutrition'

export function HouseholdSettings() {
  const { householdId, selectHousehold } = useHousehold()
  const households = useQuery(api.households.list, {})
  const members = useQuery(
    api.households.members,
    householdId ? { householdId } : 'skip',
  )
  const invitations = useQuery(
    api.households.invitations,
    householdId ? { householdId } : 'skip',
  )
  const [token, setToken] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '',
  )
  const [now] = useState(Date.now)
  const invitation = useQuery(
    api.households.inspectInvitation,
    token ? { token, now } : 'skip',
  )
  const rename = useMutation(api.households.rename)
  const invite = useMutation(api.households.invite)
  const accept = useMutation(api.households.acceptInvitation)
  const revoke = useMutation(api.households.revokeInvitation)
  const updateMember = useMutation(api.households.updateMember)
  const [name, setName] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<{
    memberId: Id<'householdMembers'>
    name: string
    role: 'admin' | 'member' | 'remove'
  } | null>(null)
  const household = households?.find((row) => row._id === householdId)
  const isAdmin = household?.role === 'admin'

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    setError('')
    try {
      await action()
    } catch (error) {
      setError(toErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Household</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in a household can view and manage its people, goals, meals,
          history, catalog, and cooking.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {token ? (
        <Card>
          <CardHeader>
            <CardTitle>Household invitation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitation === undefined ? (
              <p role="status">Loading invitation…</p>
            ) : !invitation ? (
              <p>
                This invitation has expired, was revoked, or was already used.
              </p>
            ) : (
              <>
                <p>
                  Join <strong>{invitation.name}</strong>?
                </p>
                <p>
                  Joining gives you access to all of this household’s nutrition
                  data, including everyone’s past meals and goals. Members can
                  manage the shared data. Your existing household stays
                  separate.
                </p>
                <Button
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      const id = await accept({ token })
                      window.history.replaceState(null, '', '/household')
                      setToken('')
                      selectHousehold?.(id)
                    })
                  }
                >
                  Join household
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
      {!household || !householdId || members === undefined ? (
        <p role="status">Loading household…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{household.name}</CardTitle>
              <CardDescription>
                Admins manage invitations and membership. All members can manage
                nutrition data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isAdmin ? (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(async () => {
                      await rename({
                        householdId,
                        name: name ?? household.name,
                      })
                      setName(null)
                    })
                  }}
                >
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="household-name">Household name</Label>
                    <Input
                      id="household-name"
                      value={name ?? household.name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={120}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={pending || !(name ?? household.name).trim()}
                  >
                    Save name
                  </Button>
                </form>
              ) : (
                <p>
                  Ask a household admin to rename the household or invite
                  someone.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                Removing an account ends its access. People and their nutrition
                history remain in the household.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.map((member) => (
                <div
                  key={member._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {member.name}
                      {member.isYou ? ' (you)' : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {member.role === 'admin' ? 'Admin' : 'Member'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isAdmin ? (
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          setConfirmation({
                            memberId: member._id,
                            name: member.name,
                            role: member.role === 'admin' ? 'member' : 'admin',
                          })
                        }
                      >
                        {member.role === 'admin' ? 'Make member' : 'Make admin'}
                      </Button>
                    ) : null}
                    {isAdmin || member.isYou ? (
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          setConfirmation({
                            memberId: member._id,
                            name: member.name,
                            role: 'remove',
                          })
                        }
                      >
                        {member.isYou ? 'Leave household' : 'Remove'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Invite someone</CardTitle>
                <CardDescription>
                  Anyone with the link can accept it once within seven days.
                  Share it only with someone you want to access the whole
                  household.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      const token = await invite({ householdId })
                      setLink(
                        `${window.location.origin}/household#invite=${encodeURIComponent(token)}`,
                      )
                    })
                  }
                >
                  Create invitation link
                </Button>
                {link ? (
                  <div className="space-y-2">
                    <Label htmlFor="invitation-link">Invitation link</Label>
                    <Input
                      id="invitation-link"
                      value={link}
                      readOnly
                      onFocus={(event) => event.target.select()}
                    />
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        void run(() => navigator.clipboard.writeText(link))
                      }
                    >
                      Copy link
                    </Button>
                  </div>
                ) : null}
                {invitations
                  ?.filter(
                    (row) =>
                      !row.acceptedAt && !row.revokedAt && row.expiresAt > now,
                  )
                  .map((row) => (
                    <div
                      key={row._id}
                      className="flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <p className="text-sm">
                        Expires {new Date(row.expiresAt).toLocaleDateString()}
                      </p>
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            await revoke({ householdId, invitationId: row._id })
                            setLink('')
                          })
                        }
                      >
                        Revoke invitation
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
      <ConfirmDestructiveDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
        title={
          confirmation?.role === 'remove'
            ? 'Remove household access?'
            : 'Change household role?'
        }
        description={
          confirmation?.role === 'remove'
            ? `${confirmation.name} will lose access to this household. Shared nutrition data will remain.`
            : `${confirmation?.name} will become a household ${confirmation?.role}. Admins can invite and remove members.`
        }
        confirmLabel="Confirm change"
        disabled={pending}
        onConfirm={() => {
          if (!confirmation || !householdId) return
          void run(async () => {
            try {
              await updateMember({
                householdId,
                memberId: confirmation.memberId,
                role: confirmation.role,
              })
            } finally {
              setConfirmation(null)
            }
          })
        }}
      />
    </main>
  )
}
