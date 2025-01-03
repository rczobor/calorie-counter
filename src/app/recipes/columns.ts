import { type Recipe } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<Recipe>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "category",
    header: "Category",
    meta: {
      filterVariant: "select",
    },
  },
];
