import { type Persona } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<Persona>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "targetDailyCalories",
    header: "Target Daily Calories",
  },
];
