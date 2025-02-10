import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import { type Ingredient } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { type ColumnDef } from "@tanstack/react-table";
import EditIngredientDialog from "./edit-dialog";
import { toast } from "sonner";

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
    meta: {
      filterVariant: "select",
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionButtonColumn ingredient={row.original} />,
  },
];

const ActionButtonColumn = ({ ingredient }: { ingredient: Ingredient }) => {
  const utils = api.useUtils();
  const { mutate } = api.ingredient.delete.useMutation({
    onSuccess: () => {
      void utils.ingredient.getAll.invalidate();
      toast.success("Ingredient deleted");
    },
  });

  return (
    <div className="flex justify-end gap-2">
      <EditIngredientDialog ingredient={ingredient} />
      <DeleteConfirmDialog onDelete={() => mutate({ id: ingredient.id })} />
    </div>
  );
};
