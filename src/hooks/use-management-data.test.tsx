// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseQuery = vi.fn()

vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

import { useHistoryData } from '@/hooks/use-management-data'

describe('useHistoryData', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('does not report loading while a history query is skipped', () => {
    mockUseQuery.mockReturnValue(undefined)

    const { result } = renderHook(() => useHistoryData('skip'))

    expect(mockUseQuery.mock.calls[0]?.[1]).toBe('skip')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data.meals).toEqual([])
  })
})
