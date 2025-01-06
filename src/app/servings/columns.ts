import { type Cooking, type Persona, type Serving } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<
  Serving & { cooking: Cooking | null; persona: Persona }
>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "persona.name",
    header: "Persona",
    id: "personaName",
    meta: { filterVariant: "select" },
  },
  { accessorKey: "cooking.name", header: "Cooking", id: "cookingName" },
];
