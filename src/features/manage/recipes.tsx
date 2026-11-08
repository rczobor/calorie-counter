import type { ReactNode } from 'react'

import { useMessages } from '@/i18n/messages'
import { messages } from './recipes.messages'

type RecipesSectionProps = {
  children: ReactNode
}

export function RecipesSection({ children }: RecipesSectionProps) {
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
