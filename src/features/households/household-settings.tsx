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
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { messages } from './household-settings.messages'

function srOnly(text: string) {
  return <span className="sr-only">{text}</span>
}

export function HouseholdSettings() {
  const t = useMessages(messages)
  const locale = useLocale()
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
      setError(toErrorMessage(error, locale))
    } finally {
      setPending(false)
    }
  }

  const invitationRows = invitations.results.filter(
    (row) => !row.acceptedAt && !row.revokedAt && row.expiresAt > now,
  )

  return (
    <PageShell
      title={t.household}
      breadcrumbs={<SettingsBreadcrumbs current={t.household} />}
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
          <LoadingRows label={t.loading} />
        ) : (
          <>
            <section aria-label={t.details} className="space-y-4">
              <Field label={t.current}>
                <Select
                  ariaLabel={t.switch}
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
                    label={t.name}
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
                    {t.saveName}
                  </Button>
                </form>
              ) : (
                <p className="px-4 type-subhead text-muted-foreground">
                  {t.askAdmin}
                </p>
              )}
            </section>
            <section aria-labelledby="members-title">
              <h2 id="members-title" className="group-label">
                {t.members}
              </h2>
              <RecordList label={t.members} empty={t.noMembers}>
                {members.map((member) => (
                  <RecordRow
                    key={member._id}
                    title={member.name}
                    detail={t.memberRole(member.role, member.isYou)}
                    actions={
                      isAdmin ? (
                        <ActionsMenu
                          label={t.manage(member.name)}
                          disabled={pending}
                          actions={[
                            {
                              label:
                                member.role === 'admin'
                                  ? t.makeMember
                                  : t.makeAdmin,
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
                                    label: t.remove,
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
              <Disclosure summary={t.accessTitle}>
                <p>{t.accessDescription}</p>
              </Disclosure>
            </section>
            {isAdmin ? (
              <section aria-labelledby="invite-title">
                <h2 id="invite-title" className="group-label">
                  {t.invite}
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
                      {t.createLink}
                    </Button>
                    <p className="px-4 type-footnote text-muted-foreground">
                      {t.linkTerms}
                    </p>
                  </div>
                  {link ? (
                    <Field label={t.link} htmlFor="invitation-link">
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
                          {t.copyLink}
                        </Button>
                      </div>
                    </Field>
                  ) : null}
                  {invitationRows.length ? (
                    <RecordList label={t.openInvitations} empty={null}>
                      {invitationRows.map((row) => (
                        <RecordRow
                          key={row._id}
                          title={t.link}
                          detail={t.expires(formatDate(row.expiresAt, locale))}
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
                              {t.revoke(srOnly)}
                            </Button>
                          }
                        />
                      ))}
                    </RecordList>
                  ) : null}
                  {invitations.status === 'LoadingFirstPage' ? (
                    <LoadingRows label={t.loadingInvitations} rows={1} />
                  ) : null}
                  {invitations.status === 'CanLoadMore' ||
                  invitations.status === 'LoadingMore' ? (
                    <LoadMoreButton
                      loading={pending || invitations.status === 'LoadingMore'}
                      onClick={() => invitations.loadMore(20)}
                    >
                      {t.loadMoreInvitations}
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
                  {t.leave}
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
        title={confirmation?.role === 'remove' ? t.removeTitle : t.roleTitle}
        description={
          !confirmation
            ? undefined
            : confirmation.role === 'remove'
              ? t.removeDescription(confirmation.name)
              : t.roleDescription(confirmation.name, confirmation.role)
        }
        confirmLabel={t.confirm}
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
