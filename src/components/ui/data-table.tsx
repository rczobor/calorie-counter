"use client";

import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  type RowData,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EllipsisVertical } from "lucide-react";
import { SelectTrigger } from "@radix-ui/react-select";
import { Skeleton } from "@/components/ui/skeleton";

declare module "@tanstack/react-table" {
  //allows us to define custom properties for our columns
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    filterVariant?: "text" | "range" | "select";
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  options?: readonly string[] | string[];
  nameSearch?: boolean;
  loading?: boolean;
  onClick?: (data: TData) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  options,
  nameSearch = false,
  loading = false,
  onClick,
}: DataTableProps<TData, TValue>) {
  const [nameFilter, setNameFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const tableData = useMemo(
    () => (loading ? (Array(10).fill({}) as TData[]) : data),
    [loading, data],
  );
  const tableColumns = useMemo(
    () =>
      loading
        ? columns.map((column) => ({
            ...column,
            cell: () => <Skeleton className="h-5 w-8/12" />,
          }))
        : columns,
    [loading, columns],
  );
  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  useEffect(() => {
    if (!nameSearch) return;
    table.setColumnFilters([{ id: "name", value: nameFilter }]);
  }, [nameFilter, nameSearch, table]);

  return (
    <div className="flex flex-col gap-2">
      {nameSearch && (
        <Input
          placeholder="Search..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    <div className="flex items-center gap-2">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.getCanFilter() &&
                      header.column.columnDef.meta?.filterVariant ? (
                        <Filter
                          column={header.column}
                          options={options ?? []}
                        />
                      ) : null}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => onClick?.(row.original)}
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
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Filter({
  column,
  options,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: Column<any, unknown>;
  options: readonly string[];
}) {
  const columnFilterValue = column.getFilterValue();
  const { filterVariant } = column.columnDef.meta ?? {};

  useEffect(() => {
    if (columnFilterValue !== "All") return;
    column.setFilterValue(undefined);
  }, [column, columnFilterValue]);

  return filterVariant === "range" ? (
    <div>
      <div className="flex space-x-2">
        {/* See faceted column filters example for min max values functionality */}
        <Input
          type="number"
          value={(columnFilterValue as [number, number])?.[0] ?? ""}
          onChange={(value) =>
            column.setFilterValue((old: [number, number]) => [value, old?.[1]])
          }
          placeholder={`Min`}
          className="w-24 rounded border shadow"
        />
        <Input
          type="number"
          value={(columnFilterValue as [number, number])?.[1] ?? ""}
          onChange={(value) =>
            column.setFilterValue((old: [number, number]) => [old?.[0], value])
          }
          placeholder={`Max`}
          className="w-24 rounded border shadow"
        />
      </div>
      <div className="h-1" />
    </div>
  ) : filterVariant === "select" ? (
    <Select
      onValueChange={(e) => {
        column.setFilterValue(e);
      }}
      value={columnFilterValue?.toString()}
    >
      <SelectTrigger asChild>
        <Button variant="ghost" className="p-2">
          <EllipsisVertical />
        </Button>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="All">All</SelectItem>
        {options.map((cat) => (
          <SelectItem key={cat} value={cat}>
            {cat}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <Input
      className="w-36 rounded border shadow"
      onChange={(value) => column.setFilterValue(value)}
      placeholder={`Search...`}
      type="text"
      value={(columnFilterValue ?? "") as string}
    />
    // See faceted column filters example for datalist search suggestions
  );
}
