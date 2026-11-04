import type { ReactNode } from 'react'

type FoodGroupsSectionProps = {
  children: ReactNode
}

export function FoodGroupsSection({ children }: FoodGroupsSectionProps) {
  return (
    <section>
      <div className="sr-only">
        <h2>Food Groups</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
