"use client";

import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import EditButton from "@/components/edit-button";
import { type Cooking } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { toast } from "sonner";

export const columns: ColumnDef<Cooking>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: ({ row }) => row.original.updatedAt?.toLocaleString(),
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionButtonColumn cooking={row.original} />,
  },
];

const ActionButtonColumn = ({ cooking }: { cooking: Cooking }) => {
  const utils = api.useUtils();
  const { mutate } = api.cooking.delete.useMutation({
    onSuccess: () => {
      void utils.cooking.getAll.invalidate();
      toast.success("Cooking deleted");
    },
  });

  return (
    <div className="flex justify-end gap-2">
      <Link href={`/cookings/${cooking.id}`}>
        <EditButton />
      </Link>
      <DeleteConfirmDialog onDelete={() => mutate({ id: cooking.id })} />
    </div>
  );
};
