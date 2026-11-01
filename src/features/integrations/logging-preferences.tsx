import { useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'

type ConfirmationMode = 'always' | 'explicitOnly'

export function LoggingPreferences() {
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
      confirmAndRunAction(
        'Allow fully specified, non-estimated new meals you ask to log to be saved without a second approval turn? Estimates, cooking, corrections, and transfers still require review.',
        'Logging defaults updated.',
        action,
      )
    else void runAction('Logging defaults updated.', action)
  }
  return (
    <section
      className="rounded-lg border border-border/60 bg-card p-4"
      aria-label="Logging defaults"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Logging defaults</h2>
        {!editing ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isRunning || preferences === undefined}
            onClick={beginEdit}
          >
            {preferences ? 'Edit defaults' : 'Set defaults'}
          </Button>
        ) : null}
      </div>
      {preferences === undefined ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Loading logging defaults…
        </p>
      ) : editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <fieldset
            className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2"
            disabled={isRunning}
          >
            <div className="space-y-2">
              <Label>Household</Label>
              <Select
                ariaLabel="Logging household"
                value={availableHousehold ? householdId : null}
                placeholder="Select household"
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
              <Label>Person</Label>
              <Select
                ariaLabel="Logging person"
                value={selectedPersonAvailable ? personId : null}
                placeholder="Select person"
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
                  onClick={() => people.loadMore(50)}
                >
                  Load more people
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="logging-timezone">Timezone</Label>
              <Input
                id="logging-timezone"
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                required
                placeholder="Europe/Budapest"
              />
            </div>
            <div className="space-y-2">
              <Label>Save policy</Label>
              <Select
                ariaLabel="Logging save policy"
                value={confirmationMode}
                options={[
                  { value: 'always', label: 'Always ask before saving' },
                  {
                    value: 'explicitOnly',
                    label: 'Direct logging for exact new meals',
                  },
                ]}
                onValueChange={(value) =>
                  setConfirmationMode(
                    value === 'explicitOnly' ? 'explicitOnly' : 'always',
                  )
                }
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Direct logging applies only to complete, non-estimated new meals
              you ask to log. Estimates, cooking, corrections, and transfers
              still need review and approval. ChatGPT’s own confirmation
              settings are separate.
            </p>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  !availableHousehold ||
                  !selectedPersonAvailable ||
                  !timeZone.trim()
                }
              >
                Save defaults
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      ) : preferences ? (
        <>
          <dl className="mt-3 divide-y text-sm">
            <PreferenceRow
              label="Household"
              value={preferences.householdName ?? 'Unavailable household'}
            />
            <PreferenceRow
              label="Person"
              value={preferences.personName ?? 'Unavailable person'}
            />
            <PreferenceRow label="Timezone" value={preferences.timeZone} />
            <PreferenceRow
              label="Save policy"
              value={
                preferences.confirmationMode === 'always'
                  ? 'Ask before saving'
                  : 'Direct for exact new meals'
              }
            />
          </dl>
          {!preferences.available ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              The remembered household or person is unavailable. Choose new
              defaults or reset them; the assistant will not silently select
              another household.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            These defaults apply across your ChatGPT conversations and
            connections. Browsing another person or household here does not
            change them.
          </p>
          <Button
            className="mt-3"
            variant="ghost"
            size="sm"
            disabled={isRunning}
            onClick={() =>
              confirmAndRunAction(
                'Reset logging defaults? Your assistant will ask for a household and person again. Recorded meals and connections remain.',
                'Logging defaults reset.',
                () => update({ preferences: null }),
              )
            }
          >
            Reset defaults
          </Button>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No defaults saved. Your assistant will ask which household and person
          to use.
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
    <div className="grid grid-cols-2 gap-3 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}
