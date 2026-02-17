import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { Target, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { isConvexConfigured } from '@/integrations/convex/config'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const EMPTY_MANAGEMENT_DATA = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
}

export const Route = createFileRoute('/people')({
  ssr: false,
  component: PeoplePage,
})

function PeoplePage() {
  if (!isConvexConfigured) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">Convex configuration is missing.</p>
      </main>
    )
  }

  return <PeoplePageContent />
}

function PeoplePageContent() {
  const [editingPersonId, setEditingPersonId] = useState<Id<'people'> | null>(null)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('2200')
  const [notes, setNotes] = useState('')
  const [goalReason, setGoalReason] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const dataResult = useQuery(api.nutrition.getManagementData)
  const data = (dataResult ?? EMPTY_MANAGEMENT_DATA) as NonNullable<
    typeof dataResult
  >
  const isLoading = dataResult === undefined

  const createPerson = useMutation(api.nutrition.createPerson)
  const updatePerson = useMutation(api.nutrition.updatePerson)
  const updatePersonGoal = useMutation(api.nutrition.updatePersonGoal)
  const setPersonArchived = useMutation(api.nutrition.setPersonArchived)
  const deletePerson = useMutation(api.nutrition.deletePerson)

  const [today] = useState(() => toLocalDateString(Date.now()))
  const mealItemsByMealId = useMemo(() => {
    const map = new Map<Id<'meals'>, Doc<'mealItems'>[]>()
    for (const item of data.mealItems) {
      const bucket = map.get(item.mealId)
      if (bucket) {
        bucket.push(item)
      } else {
        map.set(item.mealId, [item])
      }
    }
    return map
  }, [data.mealItems])

  const dailyConsumedByPersonId = useMemo(() => {
    const map = new Map<Id<'people'>, number>()
    for (const meal of data.meals) {
      if (Boolean(meal.archived) || getMealDateKey(meal) !== today) {
        continue
      }
      const mealCalories = (mealItemsByMealId.get(meal._id) ?? []).reduce(
        (sum, item) => sum + item.caloriesSnapshot,
        0,
      )
      map.set(meal.personId, (map.get(meal.personId) ?? 0) + mealCalories)
    }
    return map
  }, [data.meals, mealItemsByMealId, today])

  const visiblePeople = data.people.filter((person) =>
    showArchived ? true : person.active,
  )

  async function runAction(successText: string, action: () => Promise<unknown>) {
    try {
      await action()
      toast.success(successText)
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const confirmAndRunAction = (
    message: string,
    successText: string,
    action: () => Promise<unknown>,
  ) => {
    if (!window.confirm(message)) {
      return
    }
    void runAction(successText, action)
  }

  const resetForm = () => {
    setEditingPersonId(null)
    setName('')
    setGoal('2200')
    setNotes('')
    setGoalReason('')
  }

  const startEdit = (personId: Id<'people'>) => {
    const person = data.people.find((item) => item._id === personId)
    if (!person) {
      return
    }
    setEditingPersonId(personId)
    setName(person.name)
    setGoal(person.currentDailyGoalKcal.toFixed(0))
    setNotes(person.notes ?? '')
    setGoalReason('')
  }

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_18%_5%,#fdf6e7_0%,#f5f6f4_52%,#e8f1ea_100%)] dark:bg-[radial-gradient(circle_at_18%_5%,#1d2535_0%,#111a26_50%,#0a1119_100%)]">
        <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-700">
              <UserRound className="h-4 w-4" />
              People and Daily Goals
            </p>
            <Skeleton className="mt-3 h-10 w-full max-w-[38rem]" />
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-44" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`people-row-skeleton-${index}`}
                    className="rounded-lg border border-border bg-muted/45 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-44" />
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-14" />
                        <Skeleton className="h-8 w-[4.5rem]" />
                        <Skeleton className="h-8 w-14" />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-5 border-border/70 bg-card/90">
            <CardHeader>
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`history-row-skeleton-${index}`}
                  className="flex items-center justify-between rounded-md bg-muted/45 px-3 py-2"
                >
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_18%_5%,#fdf6e7_0%,#f5f6f4_52%,#e8f1ea_100%)] dark:bg-[radial-gradient(circle_at_18%_5%,#1d2535_0%,#111a26_50%,#0a1119_100%)]">
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-700">
            <UserRound className="h-4 w-4" />
            People and Daily Goals
          </p>
          <h1 data-display="true" className="mt-2 text-4xl text-foreground">
            Manage people separately from daily logging
          </h1>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle>{editingPersonId ? 'Edit person' : 'Create person'}</CardTitle>
              <CardDescription>Goal updates are tracked in history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                aria-label="Person name"
                placeholder="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                type="number"
                aria-label="Daily calorie goal"
                placeholder="Daily kcal goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
              <Input
                aria-label="Person notes"
                placeholder="Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
              <Input
                aria-label="Goal change reason"
                placeholder="Reason for goal change (optional)"
                value={goalReason}
                onChange={(event) => setGoalReason(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void runAction(
                      editingPersonId ? 'Person updated.' : 'Person created.',
                      async () => {
                        const goalValue = Number(goal)
                        if (editingPersonId) {
                          await updatePerson({
                            personId: editingPersonId,
                            name,
                            notes: notes.trim() || undefined,
                          })
                          await updatePersonGoal({
                            personId: editingPersonId,
                            goalKcal: goalValue,
                            reason: goalReason.trim() || undefined,
                            effectiveDate: today,
                          })
                        } else {
                          await createPerson({
                            name,
                            notes: notes.trim() || undefined,
                            currentDailyGoalKcal: goalValue,
                            effectiveDate: today,
                          })
                        }
                        resetForm()
                      },
                    )
                  }
                >
                  {editingPersonId ? 'Save changes' : 'Add person'}
                </Button>
                {editingPersonId ? (
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle>People</CardTitle>
              <CardDescription className="flex items-center justify-between">
                <span>Today: {today}</span>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(event) => setShowArchived(event.target.checked)}
                  />
                  Show archived
                </label>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {visiblePeople.map((person) => {
                const consumed = dailyConsumedByPersonId.get(person._id) ?? 0
                const remaining = person.currentDailyGoalKcal - consumed
                return (
                  <div
                    key={person._id}
                    className="rounded-lg border border-border bg-muted/45 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{person.name}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Target className="h-3 w-3" />
                          {remaining.toFixed(0)} kcal left today (
                          {consumed.toFixed(0)}/{person.currentDailyGoalKcal.toFixed(0)})
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(person._id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void runAction(
                              person.active ? 'Person archived.' : 'Person restored.',
                              async () => {
                                await setPersonArchived({
                                  personId: person._id,
                                  archived: person.active,
                                })
                              },
                            )
                          }
                        >
                          {person.active ? 'Archive' : 'Unarchive'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            confirmAndRunAction('Delete this person permanently?', 'Person deleted.', async () => {
                              await deletePerson({ personId: person._id })
                              if (editingPersonId === person._id) {
                                resetForm()
                              }
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-5 border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle>Goal Change History</CardTitle>
            <CardDescription>Effective-dated records per person.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.personGoalHistory.slice(0, 30).map((entry) => {
              const person = data.people.find((item) => item._id === entry.personId)
              return (
                <div
                  key={entry._id}
                  className="flex items-center justify-between rounded-md bg-muted/45 px-3 py-2 text-sm"
                >
                  <span>
                    {person?.name ?? 'Unknown'} - {entry.effectiveDate}
                  </span>
                  <span className="text-foreground/90">{entry.goalKcal.toFixed(0)} kcal</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMealDateKey(meal: {
  eatenOn?: string
  createdAt: number
}) {
  if (meal.eatenOn) {
    return meal.eatenOn
  }
  return toLocalDateString(meal.createdAt)
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Request failed.'
}
