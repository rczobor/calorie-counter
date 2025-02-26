"use client";

import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import EditButton from "@/components/edit-button";
import { type Cooking, type Persona, type Serving } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { toast } from "sonner";

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
  {
    id: "actions",
    cell: ({ row }) => <ActionButtonColumn serving={row.original} />,
  },
];

const ActionButtonColumn = ({ serving }: { serving: Serving }) => {
  const utils = api.useUtils();
  const { mutate } = api.serving.delete.useMutation({
    onSuccess: () => {
      void utils.serving.getAll.invalidate();
      toast.success("Serving deleted");
    },
  });

  return (
    <div className="flex justify-end gap-2">
      <Link href={`/cookings/${serving.cookingId}/servings`}>
        <EditButton />
      </Link>
      <DeleteConfirmDialog onDelete={() => mutate({ id: serving.id })} />
    </div>
  );
};
