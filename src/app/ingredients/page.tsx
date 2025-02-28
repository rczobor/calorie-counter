import CreateIngredientDialog from "@/app/ingredients/create-dialog";
import IngredientTable from "@/app/ingredients/table";
import { api, HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";

export default function Ingredients() {
  void api.ingredient.getAll.prefetch();

  return (
    <div className="container mx-auto flex flex-col px-4">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold">Ingredients</h1>
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
