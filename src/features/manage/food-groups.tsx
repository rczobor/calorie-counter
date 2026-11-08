import type { ReactNode } from 'react'

import { useMessages } from '@/i18n/messages'
import { messages } from './food-groups.messages'

type FoodGroupsSectionProps = {
  children: ReactNode
}

export function FoodGroupsSection({ children }: FoodGroupsSectionProps) {
  const t = useMessages(messages)
  return (
    <section>
      <div className="sr-only">
        <h2>{t.heading}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
