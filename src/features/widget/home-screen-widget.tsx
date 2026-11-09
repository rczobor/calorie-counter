import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LockKeyhole,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { PageShell } from '@/components/page/page-shell'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useHousehold } from '@/features/households/household-context'
import { PersonPicker } from '@/features/households/person-picker'
import { youFirst } from '@/features/households/you-first'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { formatDate } from '@/lib/dates'
import { toErrorMessage, toLocalDateString } from '@/lib/nutrition'
import { messages } from './home-screen-widget.messages'
import { widgetScript } from './scriptable-script'
import { WidgetPreview } from './widget-preview'

const SCRIPTABLE_APP_STORE_URL =
  'https://apps.apple.com/app/scriptable/id1405459188'
// Scriptable's URL scheme: opens the app on a new, empty script.
const SCRIPTABLE_NEW_SCRIPT_URL = 'scriptable:///add'

export function HomeScreenWidget() {
  const t = useMessages(messages)
  const locale = useLocale()
  const { householdId } = useHousehold()
  const widgets = useQuery(api.widgets.list, {})
  const people = usePaginatedQuery(
    api.people.list,
    { householdId, archived: false },
    { initialNumItems: 50 },
  )
  const create = useMutation(api.widgets.create)
  const remove = useMutation(api.widgets.remove)
  const [personId, setPersonId] = useState<Id<'people'> | null>(null)
  // The token exists only in this response, so the script lives in state.
  const [created, setCreated] = useState<{
    id: Id<'widgetTokens'>
    householdId: Id<'households'> | undefined
    personId: Id<'people'>
    person: string
    script: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [opened, setOpened] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [removing, setRemoving] = useState<{
    id: Id<'widgetTokens'>
    person: string
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  // The widget being set up lives in its setup card until Done, so it never
  // shows twice or offers Remove above Copy.
  const listed = widgets?.filter((widget) => widget.id !== created?.id)
  // The preview shows today as of opening the page, like the widget's own day.
  const [today] = useState(() => toLocalDateString(Date.now()))
  // The first person is chosen until another is picked, so the page opens on
  // a real preview and the preview, picker and Create always agree.
  const chosen =
    people.results.find((person) => person._id === personId) ??
    youFirst(people.results)[0]
  // The preview follows the chosen person, then the widget being set up.
  // The setup card keeps its own household, so switching households while it
  // is open can't ask for its person in the wrong one.
  const preview = created
    ? { householdId: created.householdId, personId: created.personId }
    : chosen
      ? { householdId, personId: chosen._id }
      : null
  const previewDay = useQuery(
    api.meals.getDayNutrition,
    preview ? { ...preview, eatenOn: today } : 'skip',
  )

  function close() {
    setCreated(null)
    setCopied(false)
    setOpened(false)
    setConfirmClose(false)
  }

  async function run(action: () => Promise<void>) {
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

  return (
    <PageShell
      title={t.title}
      subtitle={t.intro}
      breadcrumbs={<SettingsBreadcrumbs current={t.title} />}
      contentClassName="max-w-3xl"
    >
      <div className="mt-6 space-y-8">
        {/* Nothing to manage yet: the page leads with adding one. */}
        {listed === undefined || listed.length > 0 ? (
          <section aria-labelledby="widgets-title">
            <h2 id="widgets-title" className="group-label">
              {t.widgets}
            </h2>
            <RecordList
              label={t.widgets}
              loading={listed === undefined}
              empty={null}
            >
              {listed?.map((widget) => (
                <RecordRow
                  key={widget.id}
                  title={widget.person}
                  detail={t.created(formatDate(widget.createdAt, locale))}
                  actions={
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => setRemoving(widget)}
                    >
                      <Trash2 aria-hidden="true" />
                      {t.remove}
                    </Button>
                  }
                />
              ))}
            </RecordList>
          </section>
        ) : null}

        <section aria-labelledby="add-widget-title" className="space-y-3">
          <h2 id="add-widget-title" className="group-label">
            {created ? t.setupTitle(created.person) : t.addTitle}
          </h2>
          {created ? (
            <div className="inset-group space-y-4 px-4 py-4">
              {/* The one-time secret is the page's key message, so it heads
                  the card in a recessed well. The well stays inset: touching
                  the card's edge, its light fill merged with the canvas. */}
              <div className="flex gap-3 rounded-xl bg-recessed p-3">
                <LockKeyhole
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0"
                />
                {/* Once copied, the note stops urging and only reminds. */}
                <p className="type-subhead text-pretty">
                  <strong className="font-semibold">
                    {copied ? t.copiedTitle : t.secretTitle}
                  </strong>{' '}
                  {copied
                    ? t.copiedBody(created.person)
                    : t.secretBody(created.person)}
                </p>
              </div>
              {/* Copy comes first, so nobody leaves for the App Store while
                  the only copy of the script is on this page. The steps are
                  grouped by where the person is, since they switch apps. */}
              <StepGroup title={t.groupHere}>
                <Step number={1} centered done={copied}>
                  {/* The filled button walks the steps: Copy, then Open
                      Scriptable, then Done. The step's check says it's done,
                      so the button carries no second check. */}
                  <Button
                    variant={copied ? 'outline' : 'default'}
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(created.script)
                        setCopied(true)
                      })
                    }
                  >
                    <Copy aria-hidden="true" />
                    {copied ? t.copyAgain : t.copy}
                  </Button>
                </Step>
              </StepGroup>
              <StepGroup title={t.groupScriptable}>
                <Step number={2}>
                  {t.stepInstallBefore}
                  <a
                    href={SCRIPTABLE_APP_STORE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                  >
                    Scriptable
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </a>
                  {t.stepInstallAfter}
                </Step>
                <Step number={3}>
                  <p>{withControls(t.stepPaste)}</p>
                  <a
                    href={SCRIPTABLE_NEW_SCRIPT_URL}
                    onClick={() => setOpened(true)}
                    className={buttonVariants({
                      variant: copied && !opened ? 'default' : 'outline',
                      className: 'mt-2',
                    })}
                  >
                    {t.openScriptable}
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Step>
              </StepGroup>
              <StepGroup title={t.groupHomeScreen}>
                <Step number={4}>
                  <p>{withControls(t.stepAdd)}</p>
                  <p className="mt-1.5 text-muted-foreground">
                    {withControls(t.stepAddLock)}
                  </p>
                </Step>
                <Step number={5}>{withControls(t.stepEdit)}</Step>
              </StepGroup>
              {/* Before and after step 5: a widget with no script chosen is
                  the usual way this setup goes wrong, so show both states. */}
              <div className="flex justify-center gap-4 rounded-xl bg-recessed p-3">
                <figure className="space-y-1.5">
                  <WidgetPreview
                    compact
                    person={created.person}
                    text={t.script}
                    placeholder={t.unconfigured}
                    label={t.unconfiguredLabel}
                  />
                  <figcaption className="text-center type-footnote text-muted-foreground">
                    {t.afterStep(4)}
                  </figcaption>
                </figure>
                <figure className="space-y-1.5">
                  <WidgetPreview
                    compact
                    person={created.person}
                    consumed={previewDay?.consumedCalories}
                    remaining={previewDay?.remainingCalories}
                    goal={previewDay?.goalKcal}
                    text={t.script}
                    label={t.previewLabel(created.person)}
                  />
                  <figcaption className="text-center type-footnote text-muted-foreground">
                    {t.afterStep(5)}
                  </figcaption>
                </figure>
              </div>
              <details className="group border-t">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 type-subhead [&::-webkit-details-marker]:hidden">
                  {t.showScript}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <Textarea
                  aria-label={t.scriptLabel}
                  value={created.script}
                  readOnly
                  rows={8}
                  className="mb-2 max-h-64 font-mono text-xs md:text-xs"
                  onFocus={(event) => event.target.select()}
                />
              </details>
              <div className="flex justify-end">
                <Button
                  variant={opened ? 'default' : 'outline'}
                  onClick={() => (copied ? close() : setConfirmClose(true))}
                >
                  {t.done}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="inset-group space-y-4 px-4 py-4"
              onSubmit={(event) => {
                event.preventDefault()
                const person = chosen
                if (!person) return
                void run(async () => {
                  const result = await create({
                    householdId,
                    personId: person._id,
                  })
                  setCreated({
                    id: result.id,
                    householdId,
                    personId: person._id,
                    person: person.name,
                    script: widgetScript({
                      ...result,
                      appUrl: `${window.location.origin}/`,
                      text: t.script,
                    }),
                  })
                })
              }}
            >
              {chosen ? (
                // The tile sits on a recessed well, as a widget sits on the
                // Home Screen, so it never reads as a card in a card.
                <div className="flex items-center gap-4 rounded-xl bg-recessed p-3">
                  <WidgetPreview
                    person={chosen.name}
                    consumed={previewDay?.consumedCalories}
                    remaining={previewDay?.remainingCalories}
                    goal={previewDay?.goalKcal}
                    text={t.script}
                    label={t.previewLabel(chosen.name)}
                  />
                  <p className="type-subhead text-muted-foreground text-pretty">
                    {t.previewDescription}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <PersonPicker
                  value={chosen?._id ?? null}
                  placeholder={t.selectPerson}
                  options={youFirst(people.results).map((person) => ({
                    value: person._id,
                    label: person.name,
                    you: person.linkedAccount === 'you',
                  }))}
                  onValueChange={setPersonId}
                />
                {people.status === 'CanLoadMore' ||
                people.status === 'LoadingMore' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={people.status === 'LoadingMore'}
                    onClick={() => people.loadMore(50)}
                  >
                    {t.loadMorePeople}
                  </Button>
                ) : null}
                {/* The person picker's chip height, so the row is one height. */}
                <Button
                  type="submit"
                  size="sm"
                  className="ml-auto"
                  disabled={pending || !chosen}
                >
                  {pending ? t.creating : t.create}
                </Button>
              </div>
              <p className="type-footnote text-muted-foreground">{t.addHint}</p>
            </form>
          )}
          {error ? (
            <p role="alert" className="px-4 type-subhead text-destructive">
              {error}
            </p>
          ) : null}
        </section>

        <ConfirmDestructiveDialog
          open={confirmClose}
          onOpenChange={setConfirmClose}
          title={t.closeTitle}
          description={t.closeDescription}
          confirmLabel={t.closeConfirm}
          onConfirm={close}
        />
        <ConfirmDestructiveDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open && !pending) setRemoving(null)
          }}
          title={t.removeTitle(removing?.person ?? '')}
          description={t.removeDescription}
          confirmLabel={t.remove}
          disabled={pending}
          onConfirm={() => {
            if (removing)
              void run(async () => {
                await remove({ id: removing.id })
                setRemoving(null)
              })
          }}
        />
      </div>
    </PageShell>
  )
}

/** Steps under the place the person is in ("In Scriptable"). */
function StepGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2 px-3">
      <h3 className="type-footnote font-semibold text-muted-foreground">
        {title}
      </h3>
      <ol className="list-none space-y-3 type-subhead">{children}</ol>
    </section>
  )
}

/**
 * Renders "[Edit]" in a step as a key-like token, so the control to tap
 * stands out from the sentence while the person is in another app.
 */
function withControls(text: string) {
  return text.split(/\[([^\]]+)\]/).map((part, index) =>
    index % 2 ? (
      <kbd
        key={index}
        className="rounded-md bg-card px-1.5 py-px font-sans text-[0.8125rem] font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_var(--border)]"
      >
        {part}
      </kbd>
    ) : (
      part
    ),
  )
}

// Numerals sit on the card's content edge, in the lock icon's column; text
// and buttons share one indent. A button step centres its numeral, since an
// icon button has no text baseline to share. A finished step shows a check.
function Step({
  number,
  centered = false,
  done = false,
  children,
}: {
  number: number
  centered?: boolean
  done?: boolean
  children: ReactNode
}) {
  return (
    <li className={centered ? 'flex items-center gap-3' : 'flex gap-3'}>
      <span
        aria-hidden="true"
        className="w-5 shrink-0 text-muted-foreground tabular-nums"
      >
        {done ? <Check className="size-5 text-foreground" /> : `${number}.`}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}
