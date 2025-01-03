"use client";

import { columns } from "@/app/ingredients/columns";
import EditIngredientDialog from "@/app/ingredients/edit-dialog";
import { DataTable } from "@/components/ui/data-table";
import { ingredientCategories, type Ingredient } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { useState } from "react";

export default function IngredientTable() {
  const { data } = api.ingredient.getAll.useQuery();
  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);

  return (
    <>
      <DataTable
        columns={columns}
        data={data ?? []}
        options={ingredientCategories}
        nameSearch
        onClick={setSelectedIngredient}
      />

      <EditIngredientDialog
        ingredient={selectedIngredient}
        open={!!selectedIngredient}
        onCloseAction={() => {
          setSelectedIngredient(null);
        }}
      />
    </>
  );
}
