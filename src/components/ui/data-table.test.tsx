// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DataTable, type DataTableColumnDef } from '@/components/ui/data-table'

type Row = {
  name: string
  status: string
}

const columns: DataTableColumnDef<Row>[] = [
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
          { name: 'Rolled oats', status: 'Archived' },
          { name: 'Greek yogurt', status: 'Active' },
        ]}
        searchColumnId="name"
        searchPlaceholder="Search ingredients"
        emptyText="No ingredients found."
      />,
    )

    expect(screen.getByText('Greek yogurt')).toBeTruthy()
    expect(screen.getByText('Rolled oats')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /name/i }))
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(
      ['Greek yogurt', 'Active', 'Rolled oats', 'Archived'],
    )

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
