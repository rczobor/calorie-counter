import { type Serving } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";

export const columns: ColumnDef<Serving>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "persona.name", header: "Persona", id: "personaName" },
  { accessorKey: "cooking.name", header: "Cooking", id: "cookingName" },
  { accessorKey: "createdAt", header: "Created At" },
];
