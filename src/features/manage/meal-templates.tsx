import { useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import {
  useMutation,
  usePaginatedQuery,
} from '@/features/households/convex-hooks'
import { LoadingRows } from '@/components/page/loading-content'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'

type Template = FunctionReturnType<
  typeof api.savedFoods.listTemplates
>['page'][number]
type Food = FunctionReturnType<typeof api.savedFoods.list>['page'][number]
type FrozenItem = Extract<
  Template['items'][number],
  { sourceType: 'customByWeight' | 'fixedCalories' }
>

function TemplateEditor({ template }: { template: Template }) {
  const [draft, setDraft] = useState<{
    name: string
    items: FrozenItem[]
    revision: number
    quantities: string[]
    removed: boolean[]
    replacements: Array<Food | undefined>
  } | null>(null)
  const foods = usePaginatedQuery(
    api.savedFoods.list,
    draft ? { archived: false } : 'skip',
    { initialNumItems: 20 },
  )
  const update = useMutation(api.savedFoods.updateTemplate)
  const actions = useConfirmableAction()
  const conflict = draft !== null && draft.revision !== template.editRevision
  const frozen =
    draft?.items ??
    template.items.filter(
      (item) =>
        item.sourceType === 'customByWeight' ||
        item.sourceType === 'fixedCalories',
    )

  return (
    <details className="py-4">
      <summary className="cursor-pointer text-sm font-medium">
        {template.name}
        <span className="mt-1 block font-normal text-muted-foreground">
          {template.items.length} foods · Recorded nutrition
        </span>
      </summary>
      <fieldset className="mt-4 min-w-0 space-y-4" disabled={actions.isRunning}>
        {draft ? (
          <label className="block space-y-1 text-sm">
            Template name
            <Input
              value={draft.name}
              maxLength={120}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
        ) : null}
        {frozen.map((item, index) => {
          const replacement = draft?.replacements[index]
          const unit = replacement
            ? replacement.nutrition.kind === 'byWeight'
              ? 'g'
              : replacement.nutrition.kind === 'byVolume'
                ? 'ml'
                : (replacement.foodIdentity?.servingLabel ?? 'servings')
            : item.sourceType === 'customByWeight'
              ? 'g'
              : item.foodIdentity?.basis === 'ml'
                ? 'ml'
                : (item.foodIdentity?.servingLabel ?? 'recorded portions')
          return (
            <div key={index} className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {[item.foodIdentity?.brand, item.foodIdentity?.variant]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.sourceType === 'customByWeight'
                  ? `${item.consumedWeightGrams} g · ${item.kcalPer100} kcal / 100 g`
                  : `${item.servingCount ?? 1} ${item.foodIdentity?.servingLabel ?? (item.foodIdentity?.basis === 'ml' ? 'ml' : 'recorded portions')} · ${item.calories} kcal`}
              </p>
              <EstimateNotice provenance={item.nutritionProvenance} />
              {draft ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    Quantity ({unit})
                    <Input
                      type="number"
                      min="0"
                      step="any"
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
                  <label className="space-y-1 text-sm">
                    Replace {item.name}
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
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
                      <option value="">Keep recorded product</option>
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
                            ? `${food.nutrition.calories} kcal / serving`
                            : `${food.nutrition.kcalPer100} kcal / 100 ${food.nutrition.kind === 'byVolume' ? 'ml' : 'g'}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
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
                    Remove {item.name}
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
        {draft && foods.status === 'CanLoadMore' ? (
          <Button variant="outline" onClick={() => foods.loadMore(20)}>
            Load more replacement foods
          </Button>
        ) : null}
        {conflict ? (
          <p role="alert" className="text-sm text-destructive">
            This template changed. Cancel and reopen the editor to use the
            latest version.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {draft ? (
            <>
              <Button
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
                  void actions.runAction('Template updated.', async () => {
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
                          return [{ ...item, consumedWeightGrams: quantity }]
                        return [
                          {
                            ...item,
                            calories:
                              (item.calories * quantity) /
                              (item.servingCount ?? 1),
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
                    setDraft(null)
                  })
                }
              >
                Save template
              </Button>
              <Button
                variant="outline"
                disabled={actions.isRunning}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() =>
                setDraft({
                  name: template.name,
                  items: frozen,
                  revision: template.editRevision,
                  quantities: frozen.map((item) =>
                    String(
                      item.sourceType === 'customByWeight'
                        ? item.consumedWeightGrams
                        : (item.servingCount ?? 1),
                    ),
                  ),
                  removed: frozen.map(() => false),
                  replacements: frozen.map(() => undefined),
                })
              }
            >
              Edit template
            </Button>
          )}
          <Button
            variant="outline"
            disabled={actions.isRunning}
            onClick={() =>
              actions.confirmAndRunAction(
                `Delete “${template.name}”? Logged meals will keep their recorded nutrition.`,
                'Template deleted.',
                () =>
                  update({
                    input: {
                      action: 'delete',
                      templateId: template._id,
                      expectedEditRevision: template.editRevision,
                    },
                  }),
              )
            }
          >
            Delete template
          </Button>
        </div>
      </fieldset>
      <ConfirmDestructiveDialog
        open={actions.isConfirmDialogOpen}
        onOpenChange={actions.handleConfirmDialogOpenChange}
        onConfirm={actions.confirmPendingAction}
        disabled={actions.isRunning}
        description={actions.pendingConfirmation?.message}
      />
    </details>
  )
}

export function MealTemplates() {
  const [search, setSearch] = useState('')
  const templates = usePaginatedQuery(
    api.savedFoods.listTemplates,
    { search: search.trim() || undefined },
    { initialNumItems: 20 },
  )
  return (
    <section aria-label="Meal templates" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ask ChatGPT to save a logged meal as a template. Templates keep recorded
        nutrition until you explicitly replace a product. Past meals stay
        unchanged.
      </p>
      <Input
        aria-label="Search meal templates"
        placeholder="Search meal templates"
        maxLength={100}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="sm:max-w-xs"
      />
      {templates.status === 'LoadingFirstPage' ? (
        <LoadingRows label="Loading meal templates" />
      ) : templates.results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No meal templates found.
        </p>
      ) : (
        <div className="divide-y border-y">
          {templates.results.map((template) => (
            <TemplateEditor key={template._id} template={template} />
          ))}
        </div>
      )}
      {templates.status === 'CanLoadMore' ||
      templates.status === 'LoadingMore' ? (
        <Button
          variant="outline"
          disabled={templates.status === 'LoadingMore'}
          onClick={() => templates.loadMore(20)}
        >
          Load more templates
        </Button>
      ) : null}
    </section>
  )
}
