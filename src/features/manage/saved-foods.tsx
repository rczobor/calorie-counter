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
      <p className="text-sm text-muted-foreground">
        Foods explicitly remembered through ChatGPT. Past meals keep their
        recorded nutrition.
      </p>
      <Input
        aria-label="Search reusable foods"
        placeholder="Search reusable foods"
        maxLength={100}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="sm:max-w-xs"
      />
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading reusable foods…
        </p>
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
                  {food.nutrition.kind === 'fixedCalories'
                    ? `${food.nutrition.calories.toFixed(0)} kcal / saved portion`
                    : `${food.nutrition.kcalPer100.toFixed(0)} kcal / 100 g`}
                </span>
              </summary>
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {food.nutrition.kind === 'fixedCalories'
                    ? 'One saved portion is the entire originally logged item. It may include several package servings.'
                    : 'Reuse this food with a measured portion in grams.'}
                </p>
                <EstimateNotice provenance={food.nutritionProvenance} />
                <p className="text-xs text-muted-foreground">
                  To correct its nutrition, archive this entry and ask ChatGPT
                  to remember a corrected food.
                </p>
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
          onClick={() => active.loadMore(PAGE_SIZE)}
        >
          {active.status === 'LoadingMore'
            ? 'Loading…'
            : 'Load more reusable foods'}
        </Button>
      ) : null}
      {showArchived &&
      (archived.status === 'CanLoadMore' ||
        archived.status === 'LoadingMore') ? (
        <Button
          variant="outline"
          disabled={archived.status === 'LoadingMore'}
          onClick={() => archived.loadMore(PAGE_SIZE)}
        >
          {archived.status === 'LoadingMore'
            ? 'Loading…'
            : 'Load more archived foods'}
        </Button>
      ) : null}
    </section>
  )
}
