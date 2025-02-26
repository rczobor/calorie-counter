"use client";

import { type Persona } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";
import PersonaRemainingCaloriesCell from "../_components/remaining-calories-cell";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import EditButton from "@/components/edit-button";
import Link from "next/link";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";

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
  {
    id: "actions",
    cell: ({ row }) => <ActionButtonColumn persona={row.original} />,
  },
];

const ActionButtonColumn = ({ persona }: { persona: Persona }) => {
  const utils = api.useUtils();
  const { mutate } = api.cooking.delete.useMutation({
    onSuccess: () => {
      void utils.cooking.getAll.invalidate();
      toast.success("Cooking deleted");
    },
  });

  return (
    <div className="flex justify-end gap-2">
      <Link href={`/personas/${persona.id}`}>
        <EditButton />
      </Link>
      <DeleteConfirmDialog onDelete={() => mutate({ id: persona.id })} />
    </div>
  );
};
