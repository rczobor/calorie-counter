"use client";

import { type Recipe } from "@/server/db/schema";
import { type ColumnDef } from "@tanstack/react-table";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import EditButton from "@/components/edit-button";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import Link from "next/link";

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
  {
    id: "actions",
    cell: ({ row }) => <ActionButtonColumn recipe={row.original} />,
  },
];

const ActionButtonColumn = ({ recipe }: { recipe: Recipe }) => {
  const utils = api.useUtils();
  const { mutate } = api.recipe.delete.useMutation({
    onSuccess: () => {
      void utils.recipe.getAll.invalidate();
      toast.success("Recipe deleted");
    },
  });

  return (
    <div className="flex justify-end gap-2">
      <Link href={`/recipes/${recipe.id}`}>
        <EditButton />
      </Link>
      <DeleteConfirmDialog onDelete={() => mutate({ id: recipe.id })} />
    </div>
  );
};
