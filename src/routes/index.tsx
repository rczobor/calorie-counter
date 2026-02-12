import { createFileRoute } from '@tanstack/react-router'
import { Flame, Plus, Target, Utensils } from 'lucide-react'
import { useState } from 'react'
import { GoalLockSwitch } from '@/components/base-ui/goal-lock-switch'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [goalLocked, setGoalLocked] = useState(true)
  const recentEntries = [
    { name: 'Greek yogurt + berries', calories: 220, time: '07:45 AM' },
    { name: 'Chicken bowl', calories: 610, time: '12:30 PM' },
    { name: 'Protein shake', calories: 190, time: '04:10 PM' },
  ]

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_10%_20%,#fff4d8_0%,#fff8e8_45%,#f6f6f2_100%)]">
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-amber-200/60 bg-white/70 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-amber-700">
            <Flame className="h-5 w-5" />
            <span className="text-sm uppercase tracking-[0.2em]">App Shell</span>
          </div>
          <h1 data-display="true" className="mt-3 text-4xl text-slate-900">
            Daily Calorie Counter
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Starter shell only: auth and database are wired, components are
            ready, and UI sections are placeholders for meal logging flows.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="border-emerald-200/70 bg-emerald-50/60">
            <CardHeader>
              <CardDescription>Today</CardDescription>
              <CardTitle className="flex items-end gap-2 text-3xl text-slate-900">
                1,540
                <span className="text-sm text-slate-500">kcal consumed</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-3 rounded-full bg-emerald-100">
                <div className="h-full w-[68%] rounded-full bg-emerald-500" />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                760 kcal remaining from a 2,300 kcal goal.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/80 md:col-span-2">
            <CardHeader>
              <CardDescription>Quick Add</CardDescription>
              <CardTitle className="text-slate-900">Log a meal item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Meal name (placeholder only)" />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input type="number" placeholder="Calories" />
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Add entry
                </Button>
              </div>
            </CardContent>
            <CardFooter>
              <p className="text-xs text-slate-500">
                Database mutation hooks are intentionally not connected yet.
              </p>
            </CardFooter>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="border-slate-200 bg-white/80">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Utensils className="h-4 w-4" />
                Recent Entries
              </CardDescription>
              <CardTitle className="text-slate-900">Today timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentEntries.map((entry) => (
                <div
                  key={`${entry.name}-${entry.time}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-slate-50/80 px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-slate-800">{entry.name}</p>
                    <p className="text-xs text-slate-500">{entry.time}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-700">
                    {entry.calories} kcal
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-amber-200/70 bg-amber-50/60">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Preferences
              </CardDescription>
              <CardTitle className="text-slate-900">Goal settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <GoalLockSwitch
                checked={goalLocked}
                onCheckedChange={setGoalLocked}
              />
              <p className="text-xs text-slate-600">
                Base UI switch is active in the shell. Value:{' '}
                <span className="font-semibold text-slate-800">
                  {goalLocked ? 'locked' : 'unlocked'}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}
