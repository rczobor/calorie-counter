import { LoadingRows } from '@/components/page/loading-content'
import { useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ActionsMenu } from '@/components/list/actions-menu'
import { Disclosure } from '@/components/list/disclosure'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { useMessages } from '@/i18n/messages'
import { messages } from './logging-preferences.messages'

type ConfirmationMode = 'always' | 'explicitOnly'

export function LoggingPreferences() {
  const t = useMessages(messages)
  const preferences = useQuery(api.mcpPreferences.get, {})
  const households = useQuery(api.households.list, {})
  const update = useMutation(api.mcpPreferences.update)
  const [editing, setEditing] = useState(false)
  const [householdId, setHouseholdId] = useState<Id<'households'> | ''>('')
  const [personId, setPersonId] = useState<Id<'people'> | ''>('')
  const [timeZone, setTimeZone] = useState('Europe/Budapest')
  const [confirmationMode, setConfirmationMode] =
    useState<ConfirmationMode>('always')
  const availableHousehold = households?.some(
    (household) => household._id === householdId,
  )
  const people = usePaginatedQuery(
    api.people.list,
    editing && householdId && availableHousehold
      ? { householdId, archived: false }
      : 'skip',
    { initialNumItems: 50 },
  )
  const pointPerson = useQuery(
    api.people.get,
    editing &&
      householdId &&
      availableHousehold &&
      personId &&
      !people.results.some((person) => person._id === personId)
      ? { householdId, personId }
      : 'skip',
  )
  const options = [
    ...people.results,
    ...(pointPerson && !pointPerson.archived ? [pointPerson] : []),
  ]
  const selectedPersonAvailable = options.some(
    (person) => person._id === personId,
  )
  const {
    isRunning,
    runAction,
    confirmAndRunAction,
    pendingConfirmation,
    isConfirmDialogOpen,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()
  function beginEdit() {
    setHouseholdId(preferences?.householdId ?? '')
    setPersonId(preferences?.personId ?? '')
    setTimeZone(
      preferences?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
    setConfirmationMode(preferences?.confirmationMode ?? 'always')
    setEditing(true)
  }
  function save() {
    if (!householdId || !personId || !selectedPersonAvailable) return
    const action = async () => {
      await update({
        preferences: { householdId, personId, timeZone, confirmationMode },
      })
      setEditing(false)
    }
    if (
      confirmationMode === 'explicitOnly' &&
      preferences?.confirmationMode !== 'explicitOnly'
    )
      confirmAndRunAction(t.confirmDirect, t.updated, action)
    else void runAction(t.updated, action)
  }
  return (
    <section aria-label={t.title}>
      {/* The group header carries its actions on the right, as an iOS list's Edit does. */}
      <div className="flex min-h-10 items-center justify-between gap-3 pb-1">
        <h2 className="group-label pb-0">{t.title}</h2>
        {!editing ? (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={isRunning || preferences === undefined}
              onClick={beginEdit}
            >
              {preferences ? t.edit : t.set}
            </Button>
            {preferences ? (
              <ActionsMenu
                label={t.actions}
                disabled={isRunning}
                actions={[
                  {
                    label: t.reset,
                    disabled: isRunning,
                    onSelect: () =>
                      confirmAndRunAction(t.confirmReset, t.resetDone, () =>
                        update({ preferences: null }),
                      ),
                  },
                ]}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {preferences === undefined ? (
        <LoadingRows label={t.loading} rows={1} className="inset-group px-4" />
      ) : editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <fieldset
            className="mt-1 grid min-w-0 gap-4 sm:grid-cols-2"
            disabled={isRunning}
          >
            <div className="space-y-2">
              <Label>{t.household}</Label>
              <Select
                ariaLabel={t.householdSelect}
                value={availableHousehold ? householdId : null}
                placeholder={t.selectHousehold}
                options={(households ?? []).map((household) => ({
                  value: household._id,
                  label: household.name,
                }))}
                onValueChange={(value) => {
                  setHouseholdId(value ?? '')
                  setPersonId('')
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.person}</Label>
              <Select
                ariaLabel={t.personSelect}
                value={selectedPersonAvailable ? personId : null}
                placeholder={t.selectPerson}
                options={options.map((person) => ({
                  value: person._id,
                  label: person.name,
                }))}
                onValueChange={(value) => setPersonId(value ?? '')}
              />
              {people.status === 'CanLoadMore' ||
              people.status === 'LoadingMore' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={people.status === 'LoadingMore'}
                  aria-busy={people.status === 'LoadingMore'}
                  onClick={() => people.loadMore(50)}
                >
                  {t.loadMorePeople}
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="logging-timezone">{t.timeZone}</Label>
              <Input
                id="logging-timezone"
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                required
                placeholder="Europe/Budapest"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.savePolicy}</Label>
              <Select
                ariaLabel={t.savePolicySelect}
                value={confirmationMode}
                options={[
                  { value: 'always', label: t.alwaysAskOption },
                  { value: 'explicitOnly', label: t.directOption },
                ]}
                onValueChange={(value) =>
                  setConfirmationMode(
                    value === 'explicitOnly' ? 'explicitOnly' : 'always',
                  )
                }
              />
            </div>
            {confirmationMode === 'explicitOnly' ? (
              <p className="px-4 type-footnote text-muted-foreground sm:col-span-2">
                {t.directNote}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  !availableHousehold ||
                  !selectedPersonAvailable ||
                  !timeZone.trim()
                }
              >
                {t.save}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                {t.cancel}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : preferences ? (
        <>
          <dl className="inset-group inset-rows">
            <PreferenceRow
              label={t.household}
              value={preferences.householdName ?? t.unavailableHousehold}
            />
            <PreferenceRow
              label={t.person}
              value={preferences.personName ?? t.unavailablePerson}
            />
            <PreferenceRow label={t.timeZone} value={preferences.timeZone} />
            <PreferenceRow
              label={t.savePolicy}
              value={
                preferences.confirmationMode === 'always'
                  ? t.alwaysAsk
                  : t.direct
              }
            />
          </dl>
          {!preferences.available ? (
            <p role="alert" className="mt-2 px-4 type-subhead text-destructive">
              {t.unavailable}
            </p>
          ) : null}
          <Disclosure summary={t.aboutTitle} className="mt-1">
            <p>{t.aboutDescription}</p>
          </Disclosure>
        </>
      ) : (
        <p className="inset-group px-4 py-3.5 type-subhead text-muted-foreground">
          {t.empty}
        </p>
      )}
      <ConfirmDestructiveDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
        onConfirm={confirmPendingAction}
        disabled={isRunning}
        description={pendingConfirmation?.message}
      />
    </section>
  )
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    // Label and value are both content; position, not colour, tells them apart.
    <div className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-4 py-2.5 text-base">
      <dt>{label}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}
