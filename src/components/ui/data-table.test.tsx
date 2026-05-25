// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'
import { afterEach, describe, expect, it } from 'vitest'

import { DataTable } from '@/components/ui/data-table'

type Row = {
  name: string
  status: string
}

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'status',
    header: 'Status',
  },
]

afterEach(() => {
  cleanup()
})

describe('DataTable', () => {
  it('filters rows by the configured search column', () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { name: 'Greek yogurt', status: 'Active' },
          { name: 'Rolled oats', status: 'Archived' },
        ]}
        searchColumnId="name"
        searchPlaceholder="Search ingredients"
        emptyText="No ingredients found."
      />,
    )

    expect(screen.getByText('Greek yogurt')).toBeTruthy()
    expect(screen.getByText('Rolled oats')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/table search/i), {
      target: { value: 'yogurt' },
    })

    expect(screen.getByText('Greek yogurt')).toBeTruthy()
    expect(screen.queryByText('Rolled oats')).toBeNull()

    fireEvent.change(screen.getByLabelText(/table search/i), {
      target: { value: 'missing' },
    })

    expect(screen.queryByText('Greek yogurt')).toBeNull()
    expect(screen.getByText('No ingredients found.')).toBeTruthy()
  })
})
