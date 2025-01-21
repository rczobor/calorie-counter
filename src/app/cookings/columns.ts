import { type Cooking } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<Cooking>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: ({ row }) => row.original.updatedAt?.toLocaleString(),
  },
];
