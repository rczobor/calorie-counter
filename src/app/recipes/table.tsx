"use client";

import { columns } from "@/app/recipes/columns";
import { DataTable } from "@/components/ui/data-table";
import { recipeCategories } from "@/server/db/schema";
import { api } from "@/trpc/react";

export default function RecipeTable() {
	const [data] = api.recipe.getAll.useSuspenseQuery();

	return (
		<DataTable
			columns={columns}
			data={data ?? []}
			options={recipeCategories}
			nameSearch
		/>
	);
}
