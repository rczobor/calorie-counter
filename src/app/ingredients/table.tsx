"use client";

import { columns } from "@/app/ingredients/columns";
import { DataTable } from "@/components/ui/data-table";
import { ingredientCategories } from "@/server/db/schema";
import { api } from "@/trpc/react";

export default function IngredientTable() {
  const { data, isPending } = api.ingredient.getAll.useQuery();

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        options={ingredientCategories}
        nameSearch
        loading={isPending}
      />
    </>
  );
}
