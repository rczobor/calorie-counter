// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppPending } from './app-pending'
import { GoalLockSwitch } from './base-ui/goal-lock-switch'
import { CookedFoodsSection } from '../features/cooking/cooked-foods'
import { SessionsSection } from '../features/cooking/sessions'

afterEach(cleanup)

describe('composition components', () => {
  it('renders the application pending state', () => {
    render(<AppPending />)

    expect(
      screen.getByRole('heading', { name: 'Preparing your dashboard' }),
    ).toBeTruthy()
  })

  it('forwards goal lock changes', () => {
    const onCheckedChange = vi.fn()
    render(<GoalLockSwitch checked={false} onCheckedChange={onCheckedChange} />)

    fireEvent.click(screen.getByRole('switch'))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it('renders cooking section content', () => {
    render(
      <>
        <SessionsSection>Session content</SessionsSection>
        <CookedFoodsSection>Food content</CookedFoodsSection>
      </>,
    )

    expect(screen.getByText('Session content')).toBeTruthy()
    expect(screen.getByText('Food content')).toBeTruthy()
  })
})
