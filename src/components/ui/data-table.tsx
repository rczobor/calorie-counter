import { useState, type ReactNode } from 'react'
import {
  type ColumnFiltersState,
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchColumnId?: string
  searchPlaceholder?: string
  toolbarActions?: ReactNode
  emptyText?: ReactNode
  className?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumnId,
  searchPlaceholder,
  toolbarActions,
  emptyText = 'No results.',
  className,
}: DataTableProps<TData, TValue>) {
  'use no memo'

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // TanStack Table intentionally returns non-memoizable functions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const searchColumn = searchColumnId
    ? table.getColumn(searchColumnId)
    : undefined

  return (
    <div className={cn('min-w-0 w-full max-w-full space-y-3', className)}>
      {searchColumn || toolbarActions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {searchColumn ? (
            <Input
              aria-label="Table search"
              className="w-full sm:max-w-xs"
              placeholder={searchPlaceholder ?? 'Search...'}
              value={(searchColumn.getFilterValue() as string) ?? ''}
              onChange={(event) =>
                searchColumn.setFilterValue(event.target.value)
              }
            />
          ) : null}

          {toolbarActions ? (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {toolbarActions}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="w-full max-w-full overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDirection = header.column.getIsSorted()
                  const canSort =
                    header.column.getCanSort() &&
                    typeof header.column.columnDef.header === 'string'
                  const headerContent = header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sortDirection === 'asc'
                          ? 'ascending'
                          : sortDirection === 'desc'
                            ? 'descending'
                            : undefined
                      }
                    >
                      {canSort && headerContent ? (
                        <button
                          type="button"
                          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="min-w-0 truncate">
                            {headerContent}
                          </span>
                          {sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : sortDirection === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
                          )}
                        </button>
                      ) : (
                        headerContent
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-28 text-center text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
