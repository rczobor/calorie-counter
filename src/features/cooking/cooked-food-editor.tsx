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
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { useDraftPersistenceIdentity } from './draft-persistence-identity'
import {
  amountUnitLabel,
  createDraftId,
  type CookingDraft,
} from './draft-helpers'
import { writeCookingEdit } from './use-persisted-cooking-drafts'
import { nutritionUnitOptions, toErrorMessage } from '@/lib/nutrition'
import { messages } from './cooked-food-editor.messages'

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
  const t = useMessages(messages)
  const locale = useLocale()
  const unitOptions = nutritionUnitOptions(locale)
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
      toast.warning(t.recoveryUnavailable)
    }
  }, [draft, userId, t])

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
        (!Number.isFinite(kcal) || kcal <= 0)) ||
      (countedAmount !== undefined &&
        (!Number.isFinite(countedAmount) || countedAmount <= 0))
    ) {
      setError(t.invalidLine)
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
      setError(t.invalidFood)
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
      setError(t.unfinishedLine)
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
      toast.success(t.saved)
      onSaved()
    } catch (caught) {
      setError(toErrorMessage(caught, locale))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-label={t.editor}
      className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {draft.persistedCookedFoodId ? t.editTitle : t.recoverTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.historyNote}</p>
        </div>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => (dirty ? setDiscard(true) : onClose())}
        >
          {t.close}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {unsafeLegacyEdit ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {t.unsafeLegacyEdit}
        </p>
      ) : null}
      {draft.persistedCookedFoodId && original === null ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {t.originalUnavailable}
        </p>
      ) : null}
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cookedFoodName">{t.name}</Label>
            <Input
              id="cookedFoodName"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finishedWeight">{t.finishedWeight}</Label>
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
          <h3 className="font-medium">{t.composition}</h3>
          {draft.ingredientLines.map((line) => {
            const name =
              line.sourceType === 'custom'
                ? line.name
                : (line.ingredientNameSnapshot ?? t.historicalIngredient)
            const basis = amountUnitLabel(
              line.sourceType === 'custom'
                ? line.kcalBasisUnit
                : (line.kcalBasisUnitSnapshot ?? 'g'),
              locale,
            )
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
                    aria-label={t.removeLine(name)}
                    onClick={() =>
                      patch({
                        ingredientLines: draft.ingredientLines.filter(
                          (item) => item.draftId !== line.draftId,
                        ),
                      })
                    }
                  >
                    {t.remove}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`reference-${line.draftId}`}>
                      {t.referenceAmountIn(
                        amountUnitLabel(line.referenceUnit, locale),
                      )}
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
                      {t.countedAmountIn(basis)}
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
                        kcal/100 {basis}
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
                    ? t.caloriesIgnored
                    : t.countedAmountHint}
                </p>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t.lineNotes}
                  </summary>
                  <Textarea
                    aria-label={t.notesFor(name)}
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
            {t.addIngredient}
          </summary>
          {draft.lineIngredientId ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {t.unfinishedCatalogSelection}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch({ lineIngredientId: '' })}
              >
                {t.clearCatalogSelection}
              </Button>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-cooking-name">{t.ingredientName}</Label>
              <Input
                id="new-cooking-name"
                value={draft.lineCustomName}
                onChange={(e) => patch({ lineCustomName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cooking-kcal">{t.caloriesPer100Basis}</Label>
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
              <Label>{t.nutritionBasis}</Label>
              <Select
                ariaLabel={t.newNutritionBasis}
                value={draft.lineCustomBasisUnit}
                options={unitOptions}
                onValueChange={(value) =>
                  patch({ lineCustomBasisUnit: value ?? 'g' })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cooking-reference">{t.referenceAmount}</Label>
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
              <Label>{t.referenceUnit}</Label>
              <Select
                ariaLabel={t.newReferenceUnit}
                value={draft.lineReferenceUnit}
                options={unitOptions}
                onValueChange={(value) =>
                  patch({ lineReferenceUnit: value ?? 'g' })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cooking-counted">
                {t.countedAmountIn(
                  amountUnitLabel(draft.lineCustomBasisUnit, locale),
                )}
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
            {t.ignoreCalories}
          </label>
          <Button variant="outline" onClick={addLine}>
            {t.addLine}
          </Button>
        </details>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t.foodNotes}
          </summary>
          <Textarea
            className="mt-3"
            aria-label={t.cookedFoodNotes}
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </details>
        {draft.saveAsRecipe && !draft.persistedCookedFoodId ? (
          <div className="space-y-2">
            <Label htmlFor="recovery-recipe-name">
              {t.recoveredRecipeName}
            </Label>
            <Input
              id="recovery-recipe-name"
              value={draft.recipeDraftName}
              onChange={(e) => patch({ recipeDraftName: e.target.value })}
            />
            <Textarea
              aria-label={t.recoveredRecipeInstructions}
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
            {t.cancel}
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
              ? t.saving
              : draft.persistedCookedFoodId
                ? t.saveChanges
                : t.saveRecovered}
          </Button>
        </div>
      </fieldset>
      <ConfirmDestructiveDialog
        open={discard}
        onOpenChange={setDiscard}
        title={t.discardTitle}
        description={t.discardDescription}
        confirmLabel={t.discardChanges}
        onConfirm={onClose}
      />
    </section>
  )
}
