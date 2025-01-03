import RecipeForm from "@/app/recipes/form";
import { api, HydrateClient } from "@/trpc/server";

export default async function CreateRecipe() {
  await api.ingredient.getAll.prefetch();

  return (
    <HydrateClient>
      <RecipeForm />
    </HydrateClient>
  );
}
