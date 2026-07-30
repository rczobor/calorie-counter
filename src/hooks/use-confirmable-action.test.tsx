// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

import { useConfirmableAction } from '@/hooks/use-confirmable-action'

describe('useConfirmableAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs actions and reports success', async () => {
    const action = vi.fn(async () => undefined)
    const { result } = renderHook(() => useConfirmableAction())

    await act(async () => {
      await result.current.runAction('Saved.', action)
    })

    expect(action).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledWith('Saved.')
  })

  it('opens confirmation and executes pending action', async () => {
    const action = vi.fn(async () => undefined)
    const { result } = renderHook(() => useConfirmableAction())

    act(() => {
      result.current.confirmAndRunAction(
        'Delete this record?',
        'Deleted.',
        action,
      )
    })

    expect(result.current.isConfirmDialogOpen).toBe(true)
    expect(result.current.pendingConfirmation?.message).toBe(
      'Delete this record?',
    )

    await act(async () => {
      result.current.confirmPendingAction()
    })

    expect(action).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledWith('Deleted.')
  })

  it('ignores duplicate actions while one is running', async () => {
    let resolveAction: (() => void) | undefined
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve
        }),
    )
    const { result } = renderHook(() => useConfirmableAction())

    let firstRun: Promise<boolean> | undefined
    await act(async () => {
      firstRun = result.current.runAction('Saved.', action)
      await result.current.runAction('Saved twice.', action)
    })

    expect(action).toHaveBeenCalledTimes(1)
    expect(result.current.isRunning).toBe(true)

    await act(async () => {
      resolveAction?.()
      await firstRun
    })

    expect(result.current.isRunning).toBe(false)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })
})
