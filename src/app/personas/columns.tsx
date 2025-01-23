import { type Persona } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";
import PersonaRemainingCaloriesCell from "../_components/remaining-calories-cell";

export const columns: ColumnDef<Persona>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "targetDailyCalories",
    header: "Target Daily Calories",
  },
  {
    id: "caloriesLeft",
    header: "Remaining",
    cell: ({ row }) => (
      <PersonaRemainingCaloriesCell personaId={row.original.id} />
    ),
  },
];
