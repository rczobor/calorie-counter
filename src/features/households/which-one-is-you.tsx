import { useId, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { toErrorMessage } from '@/lib/nutrition'
import { messages } from './which-one-is-you.messages'

// The identity is the account and household, so a "None of these" in one
// household doesn't hide the question in another.
const storageKey = (identity: string) =>
  `calorie-counter:link-prompt-dismissed:${identity}`

function readDismissed(identity: string | null) {
  if (!identity) return false
  try {
    return window.localStorage.getItem(storageKey(identity)) === '1'
  } catch {
    return false
  }
}

function writeDismissed(identity: string | null, dismissed: boolean) {
  if (!identity) return
  try {
    if (dismissed) window.localStorage.setItem(storageKey(identity), '1')
    else window.localStorage.removeItem(storageKey(identity))
  } catch {
    /* Without storage the question returns on the next visit. */
  }
}

/**
 * Asks the member which tracked person is them, until they link one or answer
 * "None of these" on this device. Picking links at once; the toast offers Undo.
 */
export function WhichOneIsYou({
  people,
  className,
}: {
  people: readonly {
    _id: Id<'people'>
    name: string
    linkedAccount?: 'you' | 'other'
  }[]
  className?: string
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const titleId = useId()
  const { userId } = useDraftPersistenceIdentity()
  const linkedToMe = useQuery(api.people.linkedToMe, {})
  const setLinkedToMe = useMutation(api.nutrition.setPersonLinkedToMe)
  const [dismissed, setDismissed] = useState(() => readDismissed(userId))
  const [pending, setPending] = useState(false)
  // A person another member linked can't be you.
  const choices = people.filter((person) => person.linkedAccount !== 'other')
  if (linkedToMe !== null || dismissed || choices.length === 0) return null

  function fail(error: unknown) {
    toast.error(toErrorMessage(error, locale))
  }
  async function link(person: { _id: Id<'people'>; name: string }) {
    setPending(true)
    try {
      await setLinkedToMe({ personId: person._id, linked: true })
      toast.success(t.linked(person.name), {
        action: {
          label: t.undo,
          onClick: () => {
            setLinkedToMe({ personId: person._id, linked: false }).catch(fail)
          },
        },
      })
    } catch (error) {
      fail(error)
    } finally {
      setPending(false)
    }
  }
  function dismiss(next: boolean) {
    writeDismissed(userId, next)
    setDismissed(next)
  }

  return (
    <section aria-labelledby={titleId} className={className}>
      <h2 id={titleId} className="group-label">
        {t.whichIsYou}
      </h2>
      <div className="flex flex-wrap gap-2 inset-group px-4 py-3">
        {choices.map((person) => (
          <Button
            key={person._id}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void link(person)}
          >
            {t.imName(person.name)}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            dismiss(true)
            toast.success(t.hidden, {
              action: { label: t.undo, onClick: () => dismiss(false) },
            })
          }}
        >
          {t.noneOfThese}
        </Button>
      </div>
      <p className="px-4 pt-1.5 type-footnote text-pretty text-muted-foreground">
        {t.hint}
      </p>
    </section>
  )
}
