"use client";

import { columns } from "@/app/recipes/columns";
import { DataTable } from "@/components/ui/data-table";
import { recipeCategories } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

export default function RecipeTable() {
  const { data } = api.recipe.getAll.useQuery();
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={data ?? []}
      options={recipeCategories}
      nameSearch
      onClick={(recipe) => router.push(`/recipes/${recipe.id}`)}
    />
  );
}
