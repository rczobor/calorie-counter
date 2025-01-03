import { type Ingredient } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<Ingredient>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "caloriesPer100g",
    header: "Calories",
  },
  {
    accessorKey: "category",
    header: "Category",
  },
];
