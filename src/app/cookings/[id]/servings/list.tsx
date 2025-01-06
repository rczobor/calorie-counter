"use client";

import {
  calculateCaloriesPer100g,
  calculateServingTotalCalories,
  calculateServingTotalWeight,
  calculateTotalCalories,
} from "@/app/cookings/[id]/servings/utils";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";

export default function ServingList({ cookingId }: { cookingId: number }) {
  const { data: servings } = api.serving.getByCooking.useQuery({ cookingId });
  const utils = api.useUtils();
  const deleteMutation = api.serving.delete.useMutation({
    onSuccess: async () => {
      await utils.serving.getByCooking.invalidate({ cookingId });
    },
  });

  const onDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  return (
    <section className="container mx-auto flex flex-col gap-2 p-4">
      <h3 className="text-lg font-bold">Servings</h3>
      {servings?.map((serving) => (
        <Card key={serving.id} className="space-y-2 p-4">
          <div className="flex justify-between p-0 text-center">
            <div>{serving.name}</div>
            <div>
              <DeleteConfirmDialog onDelete={() => onDelete(serving.id)} />
            </div>
          </div>
          <div className="flex justify-between gap-2 py-2">
            <div>Total Kcal: {calculateServingTotalCalories(serving)}</div>
            <div>Total Weight: {calculateServingTotalWeight(serving)}g</div>
          </div>
          <DataTable
            columns={[
              {
                accessorKey: "cookedRecipe.name",
                id: "recipeName",
                header: "Recipe",
              },
              {
                accessorKey: "weightGrams",
                header: "Weight",
              },
              {
                accessorFn: (originalRow) =>
                  calculateCaloriesPer100g(originalRow.cookedRecipe),
                id: "calories",
                header: "kcal/100g",
              },
              {
                accessorFn: (originalRow) =>
                  calculateTotalCalories(originalRow),
                id: "totalCalories",
                header: "Total kcal",
              },
            ]}
            data={serving.portions}
          />
        </Card>
      ))}
    </section>
  );
}
