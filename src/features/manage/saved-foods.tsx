import { useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import {
  useMutation,
  usePaginatedQuery,
} from '@/features/households/convex-hooks'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { EditorDialog } from '@/components/page/editor-dialog'
import { ListToolbar, LoadMoreButton } from '@/components/list/list-toolbar'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { ArchiveActions, SheetFooter } from '@/components/list/sheet-footer'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'

const PAGE_SIZE = 20

type SavedFood = FunctionReturnType<typeof api.savedFoods.list>['page'][number]

/** A per-100 rate leads in plain kcal with its basis in the subtitle, as
 * ingredients do; a fixed portion keeps its portion beside the figure. */
function energy(food: SavedFood) {
  return food.nutrition.kind === 'fixedCalories'
    ? {
        value: food.nutrition.calories,
        unit: `kcal / ${food.foodIdentity?.servingLabel ?? 'saved portion'}`,
      }
    : {
        value: food.nutrition.kcalPer100,
        unit: 'kcal',
        basis: `per 100 ${food.nutrition.kind === 'byVolume' ? 'ml' : 'g'}`,
      }
}

function identity(food: SavedFood) {
  return [food.foodIdentity?.brand, food.foodIdentity?.variant]
    .filter(Boolean)
    .join(' · ')
}

export function SavedFoods({
  showArchived,
  onShowArchivedChange,
}: {
  showArchived: boolean
  onShowArchivedChange: (showArchived: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<SavedFood['_id'] | null>(null)
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
  const open = foods.find((food) => food._id === openId)

  return (
    <section className="space-y-3" aria-label="Reusable foods">
      <ListToolbar
        search={{
          label: 'Search reusable foods',
          maxLength: 100,
          value: search,
          onValueChange: setSearch,
        }}
        archived={{
          checked: showArchived,
          onCheckedChange: onShowArchivedChange,
        }}
      />
      <RecordList
        label="Reusable foods"
        loading={loading}
        empty="No reusable foods found. Ask your AI assistant to remember a logged food to save it here."
      >
        {foods.map((food) => {
          const { value, unit, basis } = energy(food)
          return (
            <RecordRow
              key={food._id}
              title={food.name}
              detail={[identity(food), basis].filter(Boolean).join(' · ')}
              value={value}
              unit={unit}
              archived={food.archivedAt !== undefined}
              onOpen={() => setOpenId(food._id)}
            />
          )
        })}
      </RecordList>
      {active.status === 'CanLoadMore' || active.status === 'LoadingMore' ? (
        <LoadMoreButton
          loading={active.status === 'LoadingMore'}
          onClick={() => active.loadMore(PAGE_SIZE)}
        >
          Load more reusable foods
        </LoadMoreButton>
      ) : null}
      {showArchived &&
      (archived.status === 'CanLoadMore' ||
        archived.status === 'LoadingMore') ? (
        <LoadMoreButton
          loading={archived.status === 'LoadingMore'}
          onClick={() => archived.loadMore(PAGE_SIZE)}
        >
          Load more archived foods
        </LoadMoreButton>
      ) : null}
      {open ? (
        <EditorDialog
          title={open.name}
          description="A reusable food keeps the nutrition it was saved with."
          pending={isRunning}
          onClose={() => setOpenId(null)}
        >
          <div className="flex flex-1 flex-col">
            <div className="space-y-3 pb-5 type-subhead">
              {identity(open) ? (
                <p className="text-muted-foreground">{identity(open)}</p>
              ) : null}
              <p className="text-foreground tabular-nums">
                <span className="type-title">{energy(open).value}</span>{' '}
                <span className="text-muted-foreground">
                  {energy(open).unit}
                </span>
              </p>
              <p className="text-muted-foreground">
                {open.nutrition.kind === 'fixedCalories'
                  ? open.foodIdentity?.servingLabel
                    ? `One serving means one ${open.foodIdentity.servingLabel}.`
                    : 'One saved portion is the entire originally logged item. It may include several package servings.'
                  : `Reuse this food with a measured portion in ${open.nutrition.kind === 'byVolume' ? 'millilitres' : 'grams'}.`}
              </p>
              <EstimateNotice provenance={open.nutritionProvenance} />
            </div>
            <SheetFooter>
              <ArchiveActions
                name={open.name}
                archived={open.archivedAt !== undefined}
                disabled={isRunning}
                onArchive={() =>
                  void runAction(
                    open.archivedAt !== undefined
                      ? 'Reusable food restored.'
                      : 'Reusable food archived.',
                    async () => {
                      await setArchived({
                        foodId: open._id,
                        archived: open.archivedAt === undefined,
                      })
                      setOpenId(null)
                    },
                  )
                }
              />
            </SheetFooter>
          </div>
        </EditorDialog>
      ) : null}
    </section>
  )
}
