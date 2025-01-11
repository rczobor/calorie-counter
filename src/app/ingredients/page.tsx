import CreateIngredientDialog from "@/app/ingredients/create-dialog";
import IngredientTable from "@/app/ingredients/table";
import { api, HydrateClient } from "@/trpc/server";

export default async function Ingredients() {
  void api.ingredient.getAll.prefetch();

  return (
    <HydrateClient>
      <div className="container mx-auto flex flex-col px-4">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold">Ingredients</h1>
          <CreateIngredientDialog />
        </div>
        <IngredientTable />
      </div>
    </HydrateClient>
  );
}
