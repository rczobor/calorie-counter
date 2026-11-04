import { LoadingRows } from '@/components/page/loading-content'
import { useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useHousehold } from './household-context'
import { HouseholdInvitation } from './household-invitation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { toErrorMessage } from '@/lib/nutrition'

export function HouseholdSettings() {
  const { householdId, selectHousehold } = useHousehold()
  const households = useQuery(api.households.list, {})
  const members = useQuery(
    api.households.members,
    householdId ? { householdId } : 'skip',
  )
  const invitations = usePaginatedQuery(
    api.households.invitations,
    householdId ? { householdId } : 'skip',
    { initialNumItems: 20 },
  )
  const [now] = useState(Date.now)
  const rename = useMutation(api.households.rename)
  const invite = useMutation(api.households.invite)
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
  const self = members?.find((member) => member.isYou)

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
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <div>
        <SettingsBreadcrumbs current="Household" />
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Household</h1>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <HouseholdInvitation onJoined={selectHousehold} />
      {!households || !household || !householdId || members === undefined ? (
        <LoadingRows label="Loading household" />
      ) : (
        <>
          <section aria-label="Household details" className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">Current household</p>
              <Select
                ariaLabel="Switch household"
                value={householdId}
                options={households.map((row) => ({
                  value: row._id,
                  label: row.name,
                }))}
                onValueChange={(id) => {
                  if (id) selectHousehold?.(id)
                }}
              />
            </div>
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
                <div className="min-w-0 flex-1 space-y-2">
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
                Ask a household admin to rename the household or invite someone.
              </p>
            )}
          </section>
          <section aria-labelledby="members-title">
            <h2 id="members-title" className="mb-3 text-sm font-semibold">
              Members
            </h2>
            <div className="divide-y border-y border-border/60">
              {members.map((member) => (
                <div
                  key={member._id}
                  className="flex items-center justify-between gap-3 py-4"
                >
                  <p className="min-w-0 break-words text-sm font-medium">
                    {member.name}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {member.role === 'admin' ? 'Admin' : 'Member'}
                      {member.isYou ? ' · You' : ''}
                    </p>
                    {isAdmin ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Manage ${member.name}`}
                              disabled={pending}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            className="min-h-9"
                            disabled={pending}
                            onClick={() =>
                              setConfirmation({
                                memberId: member._id,
                                name: member.name,
                                role:
                                  member.role === 'admin' ? 'member' : 'admin',
                              })
                            }
                          >
                            {member.role === 'admin'
                              ? 'Make member'
                              : 'Make admin'}
                          </DropdownMenuItem>
                          {!member.isYou ? (
                            <DropdownMenuItem
                              variant="destructive"
                              className="min-h-9"
                              disabled={pending}
                              onClick={() =>
                                setConfirmation({
                                  memberId: member._id,
                                  name: member.name,
                                  role: 'remove',
                                })
                              }
                            >
                              Remove
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Household access</summary>
              <p className="mt-3">
                Everyone in a household can view and manage its people, goals,
                meals, history, catalog, and cooking. Admins also manage
                invitations and membership.
              </p>
            </details>
          </section>
          {isAdmin ? (
            <section aria-labelledby="invite-title" className="space-y-4">
              <h2 id="invite-title" className="text-sm font-semibold">
                Invite someone
              </h2>
              <div className="space-y-2">
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
                <p className="text-xs text-muted-foreground">
                  One use. Expires in 7 days. Full household access.
                </p>
              </div>
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
              {invitations.results
                .filter(
                  (row) =>
                    !row.acceptedAt && !row.revokedAt && row.expiresAt > now,
                )
                .map((row) => (
                  <div
                    key={row._id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-3"
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
              {invitations.status === 'LoadingFirstPage' ? (
                <LoadingRows label="Loading invitations" rows={1} />
              ) : null}
              {invitations.status === 'CanLoadMore' ||
              invitations.status === 'LoadingMore' ? (
                <Button
                  variant="outline"
                  disabled={pending || invitations.status === 'LoadingMore'}
                  aria-busy={pending || invitations.status === 'LoadingMore'}
                  onClick={() => invitations.loadMore(20)}
                >
                  Load more invitations
                </Button>
              ) : null}
            </section>
          ) : null}
          {self ? (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                setConfirmation({
                  memberId: self._id,
                  name: self.name,
                  role: 'remove',
                })
              }
            >
              Leave household
            </Button>
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
