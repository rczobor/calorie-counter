import { useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import {
  useMutation,
  usePaginatedQuery,
} from '@/features/households/convex-hooks'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EditorDialog } from '@/components/page/editor-dialog'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { ActionsMenu } from '@/components/list/actions-menu'
import { Field } from '@/components/list/field'
import { ListToolbar, LoadMoreButton } from '@/components/list/list-toolbar'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { SheetFooter } from '@/components/list/sheet-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { formatAmount } from '@/i18n/format'
import { formatKcal } from '@/lib/nutrition'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { AssistantListEmpty } from '@/features/hints/hints'
import { messages as hintsMessages } from '@/features/hints/hints.messages'
import { messages } from './meal-templates.messages'

type Template = FunctionReturnType<
  typeof api.savedFoods.listTemplates
>['page'][number]
type Food = FunctionReturnType<typeof api.savedFoods.list>['page'][number]
type FrozenItem = Extract<
  Template['items'][number],
  { sourceType: 'customByWeight' | 'fixedCalories' }
>

function createDraft(template: Template) {
  const items = template.items.filter(
    (item): item is FrozenItem =>
      item.sourceType === 'customByWeight' ||
      item.sourceType === 'fixedCalories',
  )
  return {
    name: template.name,
    items,
    revision: template.editRevision,
    quantities: items.map((item) =>
      String(
        item.sourceType === 'customByWeight'
          ? item.consumedWeightGrams
          : (item.servingCount ?? 1),
      ),
    ),
    removed: items.map(() => false),
    replacements: items.map((): Food | undefined => undefined),
  }
}

/** Opening a template edits it; closing the sheet discards the draft. */
function TemplateSheet({
  template,
  onClose,
}: {
  template: Template
  onClose: () => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const [draft, setDraft] = useState(() => createDraft(template))
  const foods = usePaginatedQuery(
    api.savedFoods.list,
    { archived: false },
    { initialNumItems: 20 },
  )
  const update = useMutation(api.savedFoods.updateTemplate)
  const actions = useConfirmableAction()
  const conflict = draft.revision !== template.editRevision
  const frozen = draft.items

  return (
    <EditorDialog
      title={t.editTemplate}
      description={t.hint}
      pending={actions.isRunning}
      onClose={onClose}
    >
      <div className="flex flex-1 flex-col">
        <fieldset
          className="min-w-0 space-y-4 pb-5"
          disabled={actions.isRunning}
        >
          <Field
            label={t.templateName}
            htmlFor={`template-name-${template._id}`}
          >
            <Input
              id={`template-name-${template._id}`}
              value={draft.name}
              maxLength={120}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </Field>
          <ul aria-label={t.templateFoods} className="inset-group inset-rows">
            {frozen.map((item, index) => {
              const replacement = draft.replacements[index]
              const unit = replacement
                ? replacement.nutrition.kind === 'byWeight'
                  ? 'g'
                  : replacement.nutrition.kind === 'byVolume'
                    ? 'ml'
                    : (replacement.foodIdentity?.servingLabel ?? t.servings)
                : item.sourceType === 'customByWeight'
                  ? 'g'
                  : item.foodIdentity?.basis === 'ml'
                    ? 'ml'
                    : (item.foodIdentity?.servingLabel ?? t.recordedPortions)
              const brand = [
                item.foodIdentity?.brand,
                item.foodIdentity?.variant,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={index} className="space-y-3 p-4">
                  <div>
                    <p className="text-base text-foreground">{item.name}</p>
                    {brand ? (
                      <p className="type-footnote text-muted-foreground">
                        {brand}
                      </p>
                    ) : null}
                    <p className="type-footnote text-muted-foreground tabular-nums">
                      {item.sourceType === 'customByWeight'
                        ? t.weightLine(
                            formatAmount(item.consumedWeightGrams, locale),
                            formatKcal(item.kcalPer100),
                          )
                        : t.portionLine(
                            formatAmount(item.servingCount ?? 1, locale),
                            item.foodIdentity?.servingLabel ??
                              (item.foodIdentity?.basis === 'ml'
                                ? 'ml'
                                : t.recordedPortions),
                            formatKcal(item.calories),
                          )}
                    </p>
                    <EstimateNotice provenance={item.nutritionProvenance} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 type-subhead font-medium">
                      <span className="block px-4">{t.quantity(unit)}</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        className="tabular-nums"
                        disabled={draft.removed[index]}
                        value={draft.quantities[index]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            quantities: draft.quantities.map((q, i) =>
                              i === index ? event.target.value : q,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="space-y-1.5 type-subhead font-medium">
                      <span className="block px-4">{t.replace(item.name)}</span>
                      <select
                        className="h-11 w-full rounded-full border border-input bg-card px-4 text-base font-normal md:text-sm"
                        disabled={draft.removed[index]}
                        value={replacement?._id ?? ''}
                        onChange={(event) => {
                          const food = foods.results.find(
                            (food) => food._id === event.target.value,
                          )
                          const replacements = [...draft.replacements]
                          replacements[index] = food
                          setDraft({
                            ...draft,
                            replacements,
                            quantities: draft.quantities.map((q, i) =>
                              i === index
                                ? String(
                                    food
                                      ? food.nutrition.kind === 'fixedCalories'
                                        ? 1
                                        : 100
                                      : item.sourceType === 'customByWeight'
                                        ? item.consumedWeightGrams
                                        : (item.servingCount ?? 1),
                                  )
                                : q,
                            ),
                          })
                        }}
                      >
                        <option value="">{t.keepRecordedProduct}</option>
                        {foods.results.map((food) => (
                          <option key={food._id} value={food._id}>
                            {[
                              food.foodIdentity?.brand,
                              food.name,
                              food.foodIdentity?.variant,
                            ]
                              .filter(Boolean)
                              .join(' · ')}{' '}
                            ·{' '}
                            {food.nutrition.kind === 'fixedCalories'
                              ? t.kcalPerServing(
                                  formatKcal(food.nutrition.calories),
                                )
                              : t.kcalPer100(
                                  formatKcal(food.nutrition.kcalPer100),
                                  food.nutrition.kind === 'byVolume'
                                    ? 'ml'
                                    : 'g',
                                )}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-h-11 items-center gap-2.5 px-4 type-subhead">
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={draft.removed[index]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            removed: draft.removed.map((removed, i) =>
                              i === index ? event.target.checked : removed,
                            ),
                          })
                        }
                      />
                      {t.remove(item.name)}
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>
          {foods.status === 'CanLoadMore' ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => foods.loadMore(20)}
            >
              {t.loadMoreReplacements}
            </Button>
          ) : null}
          {conflict ? (
            <p role="alert" className="type-subhead text-destructive">
              {t.conflict}
            </p>
          ) : null}
        </fieldset>
        <SheetFooter>
          <ActionsMenu
            label={t.moreActions(template.name)}
            disabled={actions.isRunning}
            actions={[
              {
                label: t.delete,
                destructive: true,
                onSelect: () =>
                  actions.confirmAndRunAction(
                    t.confirmDelete(template.name),
                    t.deleted,
                    async () => {
                      await update({
                        input: {
                          action: 'delete',
                          templateId: template._id,
                          expectedEditRevision: template.editRevision,
                        },
                      })
                      onClose()
                    },
                  ),
              },
            ]}
          />
          <Button
            type="button"
            size="lg"
            disabled={
              actions.isRunning ||
              conflict ||
              !draft.name.trim() ||
              draft.removed.every(Boolean) ||
              draft.quantities.some(
                (q, i) =>
                  !draft.removed[i] &&
                  (!Number.isFinite(Number(q)) || Number(q) <= 0),
              )
            }
            onClick={() =>
              void actions.runAction(t.updated, async () => {
                const items = frozen.flatMap<Template['items'][number]>(
                  (item, index) => {
                    if (draft.removed[index]) return []
                    const quantity = Number(draft.quantities[index])
                    const food = draft.replacements[index]
                    if (food)
                      return [
                        {
                          sourceType: 'savedFood' as const,
                          savedFoodId: food._id,
                          portion:
                            food.nutrition.kind === 'byWeight'
                              ? { grams: quantity }
                              : food.nutrition.kind === 'byVolume'
                                ? { ml: quantity }
                                : { servings: quantity },
                          expectedSnapshot: {
                            name: food.name,
                            nutrition: food.nutrition,
                            foodIdentity: food.foodIdentity,
                            nutritionProvenance: food.nutritionProvenance,
                          },
                        },
                      ]
                    if (item.sourceType === 'customByWeight')
                      return [
                        {
                          ...item,
                          consumedWeightGrams: quantity,
                          servingCount:
                            item.servingCount === undefined
                              ? undefined
                              : (item.servingCount * quantity) /
                                item.consumedWeightGrams,
                        },
                      ]
                    return [
                      {
                        ...item,
                        calories:
                          (item.calories * quantity) / (item.servingCount ?? 1),
                        servingCount: quantity,
                      },
                    ]
                  },
                )
                await update({
                  input: {
                    action: 'edit',
                    templateId: template._id,
                    expectedEditRevision: draft.revision,
                    name: draft.name,
                    items,
                  },
                })
                onClose()
              })
            }
          >
            {t.save}
          </Button>
        </SheetFooter>
      </div>
      <ConfirmDestructiveDialog
        open={actions.isConfirmDialogOpen}
        onOpenChange={actions.handleConfirmDialogOpenChange}
        onConfirm={actions.confirmPendingAction}
        disabled={actions.isRunning}
        description={actions.pendingConfirmation?.message}
      />
    </EditorDialog>
  )
}

export function MealTemplates() {
  const t = useMessages(messages)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<Template['_id'] | null>(null)
  const templates = usePaginatedQuery(
    api.savedFoods.listTemplates,
    { search: search.trim() || undefined },
    { initialNumItems: 20 },
  )
  const open = templates.results.find((template) => template._id === openId)
  const nothingYet =
    !search.trim() &&
    templates.status !== 'LoadingFirstPage' &&
    templates.results.length === 0
  const hintCopy = useMessages(hintsMessages)
  return (
    <section aria-label={t.section} className="space-y-3">
      {/* The empty state says this itself. */}
      {nothingYet ? null : (
        <p className="type-subhead text-muted-foreground">{t.intro}</p>
      )}
      <ListToolbar
        search={{
          label: t.search,
          maxLength: 100,
          value: search,
          onValueChange: setSearch,
        }}
        empty={nothingYet}
      />
      <RecordList
        label={t.section}
        loading={templates.status === 'LoadingFirstPage'}
        empty={
          nothingYet ? (
            <AssistantListEmpty
              title={t.noneTitle}
              example={hintCopy.examples.template}
            >
              {t.none}
            </AssistantListEmpty>
          ) : (
            t.empty
          )
        }
      >
        {templates.results.map((template) => (
          <RecordRow
            key={template._id}
            verb={t.edit}
            title={template.name}
            detail={t.foodCount(template.items.length)}
            onOpen={() => setOpenId(template._id)}
          />
        ))}
      </RecordList>
      {templates.status === 'CanLoadMore' ||
      templates.status === 'LoadingMore' ? (
        <LoadMoreButton
          loading={templates.status === 'LoadingMore'}
          onClick={() => templates.loadMore(20)}
        >
          {t.loadMore}
        </LoadMoreButton>
      ) : null}
      {open ? (
        <TemplateSheet
          key={open._id}
          template={open}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  )
}
