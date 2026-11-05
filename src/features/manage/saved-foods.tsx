import { LoadingRows } from '@/components/page/loading-content'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import {
  useMutation,
  usePaginatedQuery,
} from '@/features/households/convex-hooks'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'

const PAGE_SIZE = 20

export function SavedFoods({ showArchived }: { showArchived: boolean }) {
  const [search, setSearch] = useState('')
  const term = search.trim().slice(0, 100)
  const args = { search: term || undefined }
  const active = usePaginatedQuery(
    api.savedFoods.list,
    { ...args, archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const archived = usePaginatedQuery(
    api.savedFoods.list,
    showArchived ? { ...args, archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const setArchived = useMutation(api.savedFoods.setArchived)
  const { runAction, isRunning } = useConfirmableAction()
  const foods = [...active.results, ...(showArchived ? archived.results : [])]
  const loading =
    active.status === 'LoadingFirstPage' ||
    (showArchived && archived.status === 'LoadingFirstPage')

  return (
    <section className="space-y-4" aria-label="Reusable foods">
      <Input
        aria-label="Search reusable foods"
        placeholder="Search reusable foods"
        maxLength={100}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="sm:max-w-xs"
      />
      {loading ? (
        <LoadingRows label="Loading reusable foods" />
      ) : foods.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No reusable foods found. Ask ChatGPT to remember a logged food to save
          it here.
        </p>
      ) : (
        <div className="divide-y border-y border-border/60">
          {foods.map((food) => (
            <details key={food._id} className="py-4">
              <summary className="cursor-pointer text-sm font-medium">
                {food.name}
                {food.archivedAt !== undefined ? ' · Archived' : ''}
                <span className="mt-1 block font-normal text-muted-foreground">
                  {[food.foodIdentity?.brand, food.foodIdentity?.variant]
                    .filter(Boolean)
                    .join(' · ')}
                  {food.foodIdentity?.brand || food.foodIdentity?.variant
                    ? ' · '
                    : ''}
                  {food.nutrition.kind === 'fixedCalories'
                    ? `${food.nutrition.calories} kcal / ${food.foodIdentity?.servingLabel ?? 'saved portion'}`
                    : `${food.nutrition.kcalPer100} kcal / 100 ${food.nutrition.kind === 'byVolume' ? 'ml' : 'g'}`}
                </span>
              </summary>
              <div className="mt-4 space-y-3 text-sm">
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer text-xs">
                    Portion & nutrition
                  </summary>
                  <p className="mt-2">
                    {food.nutrition.kind === 'fixedCalories'
                      ? food.foodIdentity?.servingLabel
                        ? `One serving means one ${food.foodIdentity.servingLabel}.`
                        : 'One saved portion is the entire originally logged item. It may include several package servings.'
                      : `Reuse this food with a measured portion in ${food.nutrition.kind === 'byVolume' ? 'millilitres' : 'grams'}.`}
                  </p>
                </details>
                <EstimateNotice provenance={food.nutritionProvenance} />

                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRunning}
                  onClick={() =>
                    void runAction(
                      food.archivedAt !== undefined
                        ? 'Reusable food restored.'
                        : 'Reusable food archived.',
                      () =>
                        setArchived({
                          foodId: food._id,
                          archived: food.archivedAt === undefined,
                        }),
                    )
                  }
                >
                  {food.archivedAt !== undefined ? 'Restore' : 'Archive'}
                </Button>
              </div>
            </details>
          ))}
        </div>
      )}
      {active.status === 'CanLoadMore' || active.status === 'LoadingMore' ? (
        <Button
          variant="outline"
          disabled={active.status === 'LoadingMore'}
          aria-busy={active.status === 'LoadingMore'}
          onClick={() => active.loadMore(PAGE_SIZE)}
        >
          Load more reusable foods
        </Button>
      ) : null}
      {showArchived &&
      (archived.status === 'CanLoadMore' ||
        archived.status === 'LoadingMore') ? (
        <Button
          variant="outline"
          disabled={archived.status === 'LoadingMore'}
          aria-busy={archived.status === 'LoadingMore'}
          onClick={() => archived.loadMore(PAGE_SIZE)}
        >
          Load more archived foods
        </Button>
      ) : null}
    </section>
  )
}
