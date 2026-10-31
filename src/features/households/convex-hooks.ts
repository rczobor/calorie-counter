import { useCallback } from 'react'
import {
  useConvex as useConvexClient,
  useMutation as useConvexMutation,
  usePaginatedQuery as useConvexPaginatedQuery,
  useQuery as useConvexQuery,
  type OptionalRestArgsOrSkip,
  type PaginatedQueryArgs,
  type PaginatedQueryReference,
} from 'convex/react'
import type { FunctionReference, OptionalRestArgs } from 'convex/server'
import { useHousehold } from './household-context'

// Every request carries its device's household; server-side membership remains authoritative.
export function useQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
) {
  const { householdId } = useHousehold()
  const [input] = args
  const scoped =
    input === 'skip' ? 'skip' : householdId ? { ...input, householdId } : input
  return useConvexQuery(query, ...([scoped] as OptionalRestArgsOrSkip<Query>))
}

export function useMutation<Mutation extends FunctionReference<'mutation'>>(
  reference: Mutation,
) {
  const { householdId } = useHousehold()
  const mutation = useConvexMutation(reference)
  return useCallback(
    (...args: OptionalRestArgs<Mutation>) => {
      const [input] = args
      return mutation(
        ...([
          householdId ? { ...input, householdId } : input,
        ] as OptionalRestArgs<Mutation>),
      )
    },
    [householdId, mutation],
  )
}

export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | 'skip',
  options: { initialNumItems: number },
) {
  const { householdId } = useHousehold()
  const scoped =
    args === 'skip' ? 'skip' : householdId ? { ...args, householdId } : args
  return useConvexPaginatedQuery(query, scoped, options)
}

export function useConvex() {
  const client = useConvexClient()
  const { householdId } = useHousehold()
  const query = useCallback(
    <Query extends FunctionReference<'query'>>(
      reference: Query,
      ...args: OptionalRestArgs<Query>
    ) => {
      const [input] = args
      return client.query(
        reference,
        ...([
          householdId ? { ...input, householdId } : input,
        ] as OptionalRestArgs<Query>),
      )
    },
    [client, householdId],
  )
  return { query }
}
