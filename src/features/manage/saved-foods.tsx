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
import { formatAmount } from '@/i18n/format'
import { useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { AssistantListEmpty } from '@/features/hints/hints'
import { messages as hintsMessages } from '@/features/hints/hints.messages'
import { messages } from './saved-foods.messages'

const PAGE_SIZE = 20

type SavedFood = FunctionReturnType<typeof api.savedFoods.list>['page'][number]

/** A per-100 rate leads in plain kcal with its basis in the subtitle, as
 * ingredients do; a fixed portion keeps its portion beside the figure. */
function energy(food: SavedFood, locale: Locale) {
  const t = messages[locale]
  return food.nutrition.kind === 'fixedCalories'
    ? {
        value: formatAmount(food.nutrition.calories, locale),
        unit: t.kcalPerPortion(
          food.foodIdentity?.servingLabel ?? t.savedPortion,
        ),
      }
    : {
        value: formatAmount(food.nutrition.kcalPer100, locale),
        unit: 'kcal',
        basis: t.per100(food.nutrition.kind === 'byVolume' ? 'ml' : 'g'),
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
  const t = useMessages(messages)
  const locale = useLocale()
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
  const nothingYet = !term && !showArchived && !loading && foods.length === 0
  const hintCopy = useMessages(hintsMessages)

  return (
    <section className="space-y-3" aria-label={t.section}>
      <ListToolbar
        search={{
          label: t.search,
          maxLength: 100,
          value: search,
          onValueChange: setSearch,
        }}
        archived={{
          checked: showArchived,
          onCheckedChange: onShowArchivedChange,
        }}
        empty={nothingYet}
      />
      <RecordList
        label={t.section}
        loading={loading}
        empty={
          nothingYet ? (
            <AssistantListEmpty
              title={t.noneTitle}
              example={hintCopy.examples.savedFood}
              onShowArchived={() => onShowArchivedChange(true)}
            >
              {t.none}
            </AssistantListEmpty>
          ) : (
            t.empty
          )
        }
      >
        {foods.map((food) => {
          const { value, unit, basis } = energy(food, locale)
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
          {t.loadMore}
        </LoadMoreButton>
      ) : null}
      {showArchived &&
      (archived.status === 'CanLoadMore' ||
        archived.status === 'LoadingMore') ? (
        <LoadMoreButton
          loading={archived.status === 'LoadingMore'}
          onClick={() => archived.loadMore(PAGE_SIZE)}
        >
          {t.loadMoreArchived}
        </LoadMoreButton>
      ) : null}
      {open ? (
        <EditorDialog
          title={open.name}
          description={t.hint}
          pending={isRunning}
          onClose={() => setOpenId(null)}
        >
          <div className="flex flex-1 flex-col">
            <div className="space-y-3 pb-5 type-subhead">
              {identity(open) ? (
                <p className="text-muted-foreground">{identity(open)}</p>
              ) : null}
              <p className="text-foreground tabular-nums">
                <span className="type-title">{energy(open, locale).value}</span>{' '}
                <span className="text-muted-foreground">
                  {/* A per-100 rate names its basis, so it never reads as a
                      fixed portion. */}
                  {[energy(open, locale).unit, energy(open, locale).basis]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </p>
              <p className="text-muted-foreground">
                {open.nutrition.kind === 'fixedCalories'
                  ? open.foodIdentity?.servingLabel
                    ? t.oneServingMeans(open.foodIdentity.servingLabel)
                    : t.wholeLoggedItem
                  : t.measuredPortion(open.nutrition.kind === 'byVolume')}
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
                    open.archivedAt !== undefined ? t.restored : t.archived,
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
