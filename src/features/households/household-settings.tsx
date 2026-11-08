import { LoadingRows } from '@/components/page/loading-content'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useHousehold } from './household-context'
import { HouseholdInvitation } from './household-invitation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { LogOut } from 'lucide-react'
import { ActionsMenu } from '@/components/list/actions-menu'
import { Disclosure } from '@/components/list/disclosure'
import { Field } from '@/components/list/field'
import { LoadMoreButton } from '@/components/list/list-toolbar'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { PageShell } from '@/components/page/page-shell'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { formatDate } from '@/lib/dates'
import { toErrorMessage } from '@/lib/nutrition'
import { cn } from '@/lib/utils'

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

  const invitationRows = invitations.results.filter(
    (row) => !row.acceptedAt && !row.revokedAt && row.expiresAt > now,
  )

  return (
    <PageShell
      title="Household"
      breadcrumbs={<SettingsBreadcrumbs current="Household" />}
      contentClassName="max-w-3xl"
    >
      <div className="mt-4 space-y-8">
        {error ? (
          <p role="alert" className="type-subhead text-destructive">
            {error}
          </p>
        ) : null}
        <HouseholdInvitation onJoined={selectHousehold} />
        {!households || !household || !householdId || members === undefined ? (
          <LoadingRows label="Loading household" />
        ) : (
          <>
            <section aria-label="Household details" className="space-y-4">
              <Field label="Current household">
                <Select
                  ariaLabel="Switch household"
                  className="h-11 w-full sm:w-80"
                  value={householdId}
                  options={households.map((row) => ({
                    value: row._id,
                    label: row.name,
                  }))}
                  onValueChange={(id) => {
                    if (id) selectHousehold?.(id)
                  }}
                />
              </Field>
              {isAdmin ? (
                <form
                  className="flex items-end gap-2"
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
                  <Field
                    label="Household name"
                    htmlFor="household-name"
                    className="flex-1 sm:max-w-80 sm:flex-none"
                  >
                    <Input
                      id="household-name"
                      className="h-11"
                      value={name ?? household.name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={120}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-11"
                    disabled={
                      pending ||
                      !(name ?? household.name).trim() ||
                      (name ?? household.name) === household.name
                    }
                  >
                    Save name
                  </Button>
                </form>
              ) : (
                <p className="px-4 type-subhead text-muted-foreground">
                  Ask a household admin to rename the household or invite
                  someone.
                </p>
              )}
            </section>
            <section aria-labelledby="members-title">
              <h2 id="members-title" className="group-label">
                Members
              </h2>
              <RecordList label="Members" empty="No members found.">
                {members.map((member) => (
                  <RecordRow
                    key={member._id}
                    title={member.name}
                    detail={`${member.role === 'admin' ? 'Admin' : 'Member'}${member.isYou ? ' · You' : ''}`}
                    actions={
                      isAdmin ? (
                        <ActionsMenu
                          label={`Manage ${member.name}`}
                          disabled={pending}
                          actions={[
                            {
                              label:
                                member.role === 'admin'
                                  ? 'Make member'
                                  : 'Make admin',
                              disabled: pending,
                              onSelect: () =>
                                setConfirmation({
                                  memberId: member._id,
                                  name: member.name,
                                  role:
                                    member.role === 'admin'
                                      ? 'member'
                                      : 'admin',
                                }),
                            },
                            ...(member.isYou
                              ? []
                              : [
                                  {
                                    label: 'Remove',
                                    destructive: true,
                                    disabled: pending,
                                    onSelect: () =>
                                      setConfirmation({
                                        memberId: member._id,
                                        name: member.name,
                                        role: 'remove',
                                      }),
                                  },
                                ]),
                          ]}
                        />
                      ) : null
                    }
                  />
                ))}
              </RecordList>
              <Disclosure summary="Household access">
                <p>
                  Everyone in a household can view and manage its people, goals,
                  meals, history, catalog, and cooking. Admins also manage
                  invitations and membership.
                </p>
              </Disclosure>
            </section>
            {isAdmin ? (
              <section aria-labelledby="invite-title">
                <h2 id="invite-title" className="group-label">
                  Invite someone
                </h2>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Button
                      className="h-11"
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
                    <p className="px-4 type-footnote text-muted-foreground">
                      One use. Expires in 7 days. Full household access.
                    </p>
                  </div>
                  {link ? (
                    <Field label="Invitation link" htmlFor="invitation-link">
                      <div className="flex gap-2">
                        <Input
                          id="invitation-link"
                          className="h-11"
                          value={link}
                          readOnly
                          onFocus={(event) => event.target.select()}
                        />
                        <Button
                          variant="outline"
                          className="h-11"
                          disabled={pending}
                          onClick={() =>
                            void run(() => navigator.clipboard.writeText(link))
                          }
                        >
                          Copy link
                        </Button>
                      </div>
                    </Field>
                  ) : null}
                  {invitationRows.length ? (
                    <RecordList label="Open invitations" empty={null}>
                      {invitationRows.map((row) => (
                        <RecordRow
                          key={row._id}
                          title="Invitation link"
                          detail={`Expires ${formatDate(row.expiresAt)}`}
                          actions={
                            <Button
                              variant="ghost"
                              className="h-11 md:h-9"
                              disabled={pending}
                              onClick={() =>
                                void run(async () => {
                                  await revoke({
                                    householdId,
                                    invitationId: row._id,
                                  })
                                  setLink('')
                                })
                              }
                            >
                              Revoke <span className="sr-only">invitation</span>
                            </Button>
                          }
                        />
                      ))}
                    </RecordList>
                  ) : null}
                  {invitations.status === 'LoadingFirstPage' ? (
                    <LoadingRows label="Loading invitations" rows={1} />
                  ) : null}
                  {invitations.status === 'CanLoadMore' ||
                  invitations.status === 'LoadingMore' ? (
                    <LoadMoreButton
                      loading={pending || invitations.status === 'LoadingMore'}
                      onClick={() => invitations.loadMore(20)}
                    >
                      Load more invitations
                    </LoadMoreButton>
                  ) : null}
                </div>
              </section>
            ) : null}
            {self ? (
              // Leaving is its own group, a destructive row as in iOS lists.
              <section className="inset-group">
                <button
                  type="button"
                  className={cn(LIST_ROW_CLASS, 'text-destructive')}
                  disabled={pending}
                  onClick={() =>
                    setConfirmation({
                      memberId: self._id,
                      name: self.name,
                      role: 'remove',
                    })
                  }
                >
                  <LogOut aria-hidden="true" className="size-5" />
                  Leave household
                </button>
              </section>
            ) : null}
          </>
        )}
      </div>
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
    </PageShell>
  )
}
