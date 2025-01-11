import RecipeForm from "@/app/recipes/form";
import { api, HydrateClient } from "@/trpc/server";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;

  void api.recipe.getByIdWithRelations.prefetch({ id: Number(id) });

  return (
    <HydrateClient>
      <RecipeForm id={Number(id)} />
    </HydrateClient>
  );
}
