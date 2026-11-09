import { Link } from '@tanstack/react-router'
import {
  ChartColumn,
  Gauge,
  MessageCircle,
  Smartphone,
  UserPlus,
  Weight,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Hint } from '../../../convex/lib/hints'
import { Button, buttonVariants } from '@/components/ui/button'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { InstallEntry } from '@/features/install/install-entry'
import { useInstall } from '@/features/install/install-provider'
import { useMessages } from '@/i18n/messages'
import { messages } from './hints.messages'

export const HINT_DETAILS = {
  assistant: { icon: MessageCircle, to: '/settings/integrations' },
  history: { icon: ChartColumn, to: '/history' },
  weighIn: { icon: Weight, to: '/weight' },
  maintenance: { icon: Gauge, to: '/weight' },
  invite: { icon: UserPlus, to: '/household' },
  widget: { icon: Smartphone, to: '/settings/widget' },
} as const satisfies Record<Hint, { icon: LucideIcon; to: string }>

/** Marks a hint seen for the account, on every device. */
export function useMarkHintSeen() {
  const setSeen = useMutation(api.hints.setSeen)
  // Stable, so effects that mark a hint seen run once.
  return useCallback(
    (hint: Hint) => {
      // Best effort: a failed write only means the hint may show once more.
      setSeen({ hint, seen: true }).catch(() => {})
    },
    [setSeen],
  )
}

// At most one hint per app launch. The first one shown keeps Today's slot
// until it is dismissed or followed; none replaces it before the next launch.
type Slot = Hint | 'install' | 'done' | null
let launchSlot: Slot = null
const slotListeners = new Set<() => void>()

function setLaunchSlot(next: Slot) {
  launchSlot = next
  for (const listener of slotListeners) listener()
}

function subscribeSlot(listener: () => void) {
  slotListeners.add(listener)
  return () => slotListeners.delete(listener)
}

const readSlot = () => launchSlot

/** Test seam: a fresh launch. */
export function resetHintLaunch() {
  setLaunchSlot(null)
}

/**
 * Today's hint slot: one server-qualified hint, else the install suggestion.
 * A hint counts as seen as soon as it shows, so it never shows twice.
 */
export function TodayHint({
  today,
  visible,
}: {
  today: string
  /** False while something else holds Today's attention, such as an open meal. */
  visible: boolean
}) {
  const eligible = useQuery(api.hints.eligible, { today })
  const install = useInstall()
  const markSeen = useMarkHintSeen()
  const slot = useSyncExternalStore(subscribeSlot, readSlot, readSlot)
  const candidate =
    eligible?.find(
      (hint) => hint !== 'widget' || install?.platform === 'ios',
    ) ?? (eligible && install?.suggest ? 'install' : null)

  useEffect(() => {
    if (!visible || launchSlot !== null || !candidate) return
    setLaunchSlot(candidate)
    if (candidate !== 'install') markSeen(candidate)
  }, [visible, candidate, markSeen])

  const finish = () => setLaunchSlot('done')

  if (slot === null || slot === 'done') return null
  if (slot === 'install')
    return <InstallEntry variant="suggestion" eligible={visible} />
  return visible ? <HintCard hint={slot} onFinish={finish} /> : null
}

/** The action for empty lists only the AI assistant fills (cooking, reusable foods, templates). */
export function AssistantSetupLink() {
  const t = useMessages(messages)
  return (
    <Link
      to="/settings/integrations"
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {t.hints.assistant.action}
    </Link>
  )
}

function HintCard({ hint, onFinish }: { hint: Hint; onFinish: () => void }) {
  const t = useMessages(messages)
  const { icon: Icon, to } = HINT_DETAILS[hint]
  const copy = t.hints[hint]
  // A guest on the page: an outline on the canvas, never a filled cell that
  // would rank with the day summary and the meals.
  return (
    <section
      aria-label={copy.title}
      className="mt-6 rounded-xl border px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <h2 className="type-headline">{copy.title}</h2>
          <p className="mt-0.5 type-subhead text-muted-foreground">
            {copy.body}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Link
              to={to}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              onClick={onFinish}
            >
              {copy.action}
            </Link>
            <Button variant="ghost" size="sm" onClick={onFinish}>
              {t.gotIt}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
