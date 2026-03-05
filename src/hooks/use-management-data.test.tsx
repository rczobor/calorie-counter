// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mockUseQuery = vi.fn()

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

import { useManagementData } from "@/hooks/use-management-data"

describe("useManagementData", () => {
  it("returns loading fallback when query is undefined", () => {
    mockUseQuery.mockReturnValue(undefined)

    const { result } = renderHook(() => useManagementData())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data.people).toEqual([])
    expect(result.current.data.meals).toEqual([])
  })

  it("returns query data when available", () => {
    mockUseQuery.mockReturnValue({
      people: [{ _id: "p1", name: "Alex" }],
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
    })

    const { result } = renderHook(() => useManagementData())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data.people).toHaveLength(1)
  })
})
