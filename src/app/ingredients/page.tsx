import CreateIngredientDialog from "@/app/ingredients/create-dialog";
import IngredientTable from "@/app/ingredients/table";
import { DataTable } from "@/components/ui/data-table";
import { HydrateClient, api } from "@/trpc/server";
import { Suspense } from "react";
import { columns } from "./columns";

export default function Ingredients() {
	void api.ingredient.getAll.prefetch();

	return (
		<div className="container mx-auto flex flex-col px-4">
			<div className="flex items-center justify-between py-4">
				<h1 className="font-bold text-2xl">Ingredients</h1>
				<CreateIngredientDialog />
			</div>
			<HydrateClient>
				<Suspense fallback={<DataTable columns={columns} loading={true} />}>
					<IngredientTable />
				</Suspense>
			</HydrateClient>
		</div>
	);
}
