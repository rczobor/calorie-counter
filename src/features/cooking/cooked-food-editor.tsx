import { useEffect, useRef, useState } from 'react'
import type { FunctionArgs } from 'convex/server'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { useDraftPersistenceIdentity } from './draft-persistence-identity'
import { createDraftId, type CookingDraft } from './draft-helpers'
import { writeCookingEdit } from './use-persisted-cooking-drafts'
import { NUTRITION_UNIT_OPTIONS, toErrorMessage } from '@/lib/nutrition'

type IngredientInput = FunctionArgs<
  typeof api.nutrition.updateCookedFood
>['ingredients'][number]

export function cookingDraftIngredients(
  draft: CookingDraft,
): IngredientInput[] {
  return draft.ingredientLines.map((line) => {
    const common = {
      existingCookedFoodIngredientId: line.existingCookedFoodIngredientId,
      referenceAmount: line.referenceAmount,
      referenceUnit: line.referenceUnit,
      countedAmount: line.countedAmount,
      notes: line.notes,
      nutritionProvenance: line.nutritionProvenance,
    }
    if (line.sourceType === 'ingredient') {
      return {
        ...common,
        sourceType: 'ingredient',
        ingredientId: line.ingredientId,
        ...(line.existingCookedFoodIngredientId
          ? {}
          : {
              expectedSnapshot: {
                name: line.ingredientNameSnapshot ?? '',
                kcalPer100: line.kcalPer100Snapshot ?? 0,
                kcalBasisUnit: line.kcalBasisUnitSnapshot ?? 'g',
                ignoreCalories: line.ignoreCaloriesSnapshot ?? false,
              },
            }),
      }
    }
    return {
      ...common,
      sourceType: 'custom',
      ingredientId: line.ingredientId,
      name: line.name,
      kcalPer100: line.kcalPer100,
      kcalBasisUnit: line.kcalBasisUnit,
      ignoreCalories: line.ignoreCalories,
      saveToCatalog: line.saveToCatalog,
    }
  })
}

export function CookedFoodEditor({
  initialDraft,
  onClose,
  onSaved,
}: {
  initialDraft: CookingDraft
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const warnedRef = useRef(false)
  const { userId } = useDraftPersistenceIdentity()
  const update = useMutation(api.nutrition.updateCookedFood)
  const create = useMutation(api.nutrition.createCookedFood)
  const session = useQuery(api.cooking.getSession, {
    sessionId: draft.sessionId,
  })
  const original = useQuery(
    api.cooking.getCookedFoodDetail,
    draft.persistedCookedFoodId
      ? { cookedFoodId: draft.persistedCookedFoodId }
      : 'skip',
  )
  const dirty =
    draft.isDirty || JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const unsafeLegacyEdit = Boolean(
    draft.persistedCookedFoodId &&
    (!draft.hasAuthoritativeIngredientIds ||
      !draft.expectedCookedFoodIngredientIds ||
      draft.expectedCookedFoodEditRevision === undefined),
  )

  useEffect(() => {
    if (!writeCookingEdit(userId, draft) && !warnedRef.current) {
      warnedRef.current = true
      toast.warning(
        'Edit recovery is unavailable. Keep this tab open until you save or discard your changes.',
      )
    }
  }, [draft, userId])

  useEffect(() => {
    const preventClose = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', preventClose)
    return () => window.removeEventListener('beforeunload', preventClose)
  }, [dirty])

  function patch(next: Partial<CookingDraft>) {
    setDraft((current) => ({ ...current, ...next, isDirty: true }))
  }

  function addLine() {
    const referenceAmount = Number(draft.lineReferenceAmount)
    const countedAmount = draft.lineCountedAmount.trim()
      ? Number(draft.lineCountedAmount)
      : undefined
    const kcal = Number(draft.lineCustomKcal)
    if (
      !draft.lineCustomName.trim() ||
      !Number.isFinite(referenceAmount) ||
      referenceAmount <= 0 ||
      (!draft.lineCustomIgnoreCalories &&
        (!Number.isFinite(kcal) || kcal < 0)) ||
      (countedAmount !== undefined &&
        (!Number.isFinite(countedAmount) || countedAmount <= 0))
    ) {
      setError(
        'Enter an ingredient name, positive reference amount, and valid nutrition and counted amount.',
      )
      return
    }
    patch({
      ingredientLines: [
        ...draft.ingredientLines,
        {
          draftId: createDraftId(),
          sourceType: 'custom',
          name: draft.lineCustomName.trim(),
          kcalPer100: draft.lineCustomIgnoreCalories ? 0 : kcal,
          kcalBasisUnit: draft.lineCustomBasisUnit,
          ignoreCalories: draft.lineCustomIgnoreCalories,
          referenceAmount,
          referenceUnit: draft.lineReferenceUnit,
          countedAmount,
          saveToCatalog: false,
          notes: draft.lineNotes,
        },
      ],
      lineCustomName: '',
      lineCustomKcal: '',
      lineReferenceAmount: '',
      lineCountedAmount: '',
      lineNotes: '',
    })
    setError('')
  }

  async function save() {
    const weight = Number(draft.finishedWeight)
    if (
      !draft.name.trim() ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      !draft.ingredientLines.length
    ) {
      setError(
        'Enter a name, a positive finished weight, and at least one ingredient.',
      )
      return
    }
    if (unsafeLegacyEdit) return
    if (
      draft.lineIngredientId ||
      draft.lineCustomName.trim() ||
      draft.lineReferenceAmount.trim() ||
      draft.lineCountedAmount.trim() ||
      draft.lineCustomKcal.trim()
    ) {
      setError('Add or clear the unfinished ingredient before saving.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const common = {
        cookSessionId: draft.sessionId,
        name: draft.name,
        recipeId: draft.recipeId || undefined,
        recipeVersionId: draft.recipeVersionId || undefined,
        groupId: draft.groupId || undefined,
        finishedWeightGrams: weight,
        nutritionProvenance: draft.nutritionProvenance,
        notes: draft.notes,
        ingredients: cookingDraftIngredients(draft),
      }
      const result = draft.persistedCookedFoodId
        ? await update({
            ...common,
            cookedFoodId: draft.persistedCookedFoodId,
            expectedCookedFoodIngredientIds:
              draft.expectedCookedFoodIngredientIds ?? [],
            expectedEditRevision: draft.expectedCookedFoodEditRevision ?? 0,
          })
        : await create({
            ...common,
            saveAsRecipe: draft.saveAsRecipe || undefined,
            recipeDraft: draft.saveAsRecipe
              ? {
                  name: draft.recipeDraftName,
                  instructions: draft.recipeDraftInstructions || undefined,
                }
              : undefined,
          })
      // Persist the successful revision before cleanup so a storage failure cannot
      // leave this tab offering to create the same recovered food a second time.
      const savedDraft = {
        ...draft,
        persistedCookedFoodId: result.cookedFoodId,
        hasAuthoritativeIngredientIds: true,
        expectedCookedFoodIngredientIds: result.cookedFoodIngredientIds,
        expectedCookedFoodEditRevision: result.editRevision,
        isDirty: false,
      }
      setDraft(savedDraft)
      writeCookingEdit(userId, savedDraft)
      toast.success(
        'Cooked food saved. Previously logged meals keep their recorded nutrition.',
      )
      onSaved()
    } catch (caught) {
      setError(toErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-label="Cooked food editor"
      className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {draft.persistedCookedFoodId
              ? 'Edit cooked food'
              : 'Recover cooking draft'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Existing meals keep their historical portions and nutrition.
          </p>
        </div>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => (dirty ? setDiscard(true) : onClose())}
        >
          Close
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {unsafeLegacyEdit ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          This older edit has no safe revision baseline. Export the recovered
          draft, then reopen the current cooked food to apply your changes.
        </p>
      ) : null}
      {draft.persistedCookedFoodId && original === null ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          This cooked food is unavailable. Your recovered edit is preserved.
        </p>
      ) : null}
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cookedFoodName">Name</Label>
            <Input
              id="cookedFoodName"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finishedWeight">Finished weight (g)</Label>
            <Input
              id="finishedWeight"
              type="number"
              min="0.01"
              step="any"
              value={draft.finishedWeight}
              onChange={(e) => patch({ finishedWeight: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="font-medium">Composition</h3>
          {draft.ingredientLines.map((line) => {
            const name =
              line.sourceType === 'custom'
                ? line.name
                : (line.ingredientNameSnapshot ?? 'Historical ingredient')
            const basis =
              line.sourceType === 'custom'
                ? line.kcalBasisUnit
                : (line.kcalBasisUnitSnapshot ?? 'g')
            return (
              <div
                key={line.draftId}
                className="space-y-3 rounded-lg border border-border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{name}</p>
                    <EstimateNotice provenance={line.nutritionProvenance} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${name}`}
                    onClick={() =>
                      patch({
                        ingredientLines: draft.ingredientLines.filter(
                          (item) => item.draftId !== line.draftId,
                        ),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`reference-${line.draftId}`}>
                      Reference amount ({line.referenceUnit})
                    </Label>
                    <Input
                      id={`reference-${line.draftId}`}
                      type="number"
                      min="0.01"
                      step="any"
                      value={line.referenceAmount}
                      onChange={(e) =>
                        patch({
                          ingredientLines: draft.ingredientLines.map((item) =>
                            item.draftId === line.draftId
                              ? {
                                  ...item,
                                  referenceAmount: Number(e.target.value),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`counted-${line.draftId}`}>
                      Counted amount ({basis})
                    </Label>
                    <Input
                      id={`counted-${line.draftId}`}
                      type="number"
                      min="0.01"
                      step="any"
                      value={line.countedAmount ?? ''}
                      onChange={(e) =>
                        patch({
                          ingredientLines: draft.ingredientLines.map((item) =>
                            item.draftId === line.draftId
                              ? {
                                  ...item,
                                  countedAmount: e.target.value.trim()
                                    ? Number(e.target.value)
                                    : undefined,
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                  {line.sourceType === 'custom' ? (
                    <div className="space-y-1">
                      <Label htmlFor={`kcal-${line.draftId}`}>
                        kcal / 100 {basis}
                      </Label>
                      <Input
                        id={`kcal-${line.draftId}`}
                        type="number"
                        min="0"
                        step="any"
                        value={line.kcalPer100}
                        onChange={(e) =>
                          patch({
                            ingredientLines: draft.ingredientLines.map(
                              (item) =>
                                item.draftId === line.draftId &&
                                item.sourceType === 'custom'
                                  ? {
                                      ...item,
                                      kcalPer100: Number(e.target.value),
                                    }
                                  : item,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(
                    line.sourceType === 'custom'
                      ? line.ignoreCalories
                      : line.ignoreCaloriesSnapshot
                  )
                    ? 'Calories ignored.'
                    : 'A reference quantity alone does not convert to the nutrition basis. Enter the counted amount in its stated unit.'}
                </p>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Line notes
                  </summary>
                  <Textarea
                    aria-label={`Notes for ${name}`}
                    value={line.notes ?? ''}
                    onChange={(e) =>
                      patch({
                        ingredientLines: draft.ingredientLines.map((item) =>
                          item.draftId === line.draftId
                            ? { ...item, notes: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </details>
              </div>
            )
          })}
        </div>
        <details
          open={Boolean(
            draft.lineCustomName ||
            draft.lineReferenceAmount ||
            draft.lineIngredientId,
          )}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Add an ingredient
          </summary>
          {draft.lineIngredientId ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                An unfinished catalog selection remains in this recovered draft.
                Copy it from the original export, or clear the selection before
                saving.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch({ lineIngredientId: '' })}
              >
                Clear unfinished catalog selection
              </Button>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-cooking-name">Ingredient name</Label>
              <Input
                id="new-cooking-name"
                value={draft.lineCustomName}
                onChange={(e) => patch({ lineCustomName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cooking-kcal">
                Calories / 100 basis units
              </Label>
              <Input
                id="new-cooking-kcal"
                type="number"
                min="0"
                step="any"
                value={draft.lineCustomKcal}
                onChange={(e) => patch({ lineCustomKcal: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Nutrition basis</Label>
              <Select
                ariaLabel="New ingredient nutrition basis"
                value={draft.lineCustomBasisUnit}
                options={NUTRITION_UNIT_OPTIONS}
                onValueChange={(value) =>
                  patch({ lineCustomBasisUnit: value ?? 'g' })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cooking-reference">Reference amount</Label>
              <Input
                id="new-cooking-reference"
                type="number"
                min="0.01"
                step="any"
                value={draft.lineReferenceAmount}
                onChange={(e) => patch({ lineReferenceAmount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Reference unit</Label>
              <Select
                ariaLabel="New ingredient reference unit"
                value={draft.lineReferenceUnit}
                options={NUTRITION_UNIT_OPTIONS}
                onValueChange={(value) =>
                  patch({ lineReferenceUnit: value ?? 'g' })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cooking-counted">
                Counted amount ({draft.lineCustomBasisUnit})
              </Label>
              <Input
                id="new-cooking-counted"
                type="number"
                min="0.01"
                step="any"
                value={draft.lineCountedAmount}
                onChange={(e) => patch({ lineCountedAmount: e.target.value })}
              />
            </div>
          </div>
          <label className="my-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.lineCustomIgnoreCalories}
              onChange={(e) =>
                patch({ lineCustomIgnoreCalories: e.target.checked })
              }
            />
            Ignore calories
          </label>
          <Button variant="outline" onClick={addLine}>
            Add ingredient line
          </Button>
        </details>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Food notes
          </summary>
          <Textarea
            className="mt-3"
            aria-label="Cooked food notes"
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </details>
        {draft.saveAsRecipe && !draft.persistedCookedFoodId ? (
          <div className="space-y-2">
            <Label htmlFor="recovery-recipe-name">Recovered recipe name</Label>
            <Input
              id="recovery-recipe-name"
              value={draft.recipeDraftName}
              onChange={(e) => patch({ recipeDraftName: e.target.value })}
            />
            <Textarea
              aria-label="Recovered recipe instructions"
              value={draft.recipeDraftInstructions}
              onChange={(e) =>
                patch({ recipeDraftInstructions: e.target.value })
              }
            />
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => (dirty ? setDiscard(true) : onClose())}
          >
            Cancel
          </Button>
          <Button
            disabled={
              unsafeLegacyEdit ||
              !session ||
              (!draft.persistedCookedFoodId && session.archived) ||
              original === null
            }
            onClick={() => void save()}
          >
            {saving
              ? 'Saving…'
              : draft.persistedCookedFoodId
                ? 'Save changes'
                : 'Save recovered cooking'}
          </Button>
        </div>
      </fieldset>
      <ConfirmDestructiveDialog
        open={discard}
        onOpenChange={setDiscard}
        title="Discard cooking changes?"
        description="Your unsaved changes in this editor will be lost. Existing records and other recovered drafts stay in place."
        confirmLabel="Discard changes"
        onConfirm={onClose}
      />
    </section>
  )
}
