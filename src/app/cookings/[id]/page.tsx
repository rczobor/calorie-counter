import CookingForm from "@/app/cookings/form";
import { api, HydrateClient } from "@/trpc/server";

export default async function CookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;

  void api.cooking.getByIdWithRelations.prefetch({ id: Number(id) });
  void api.recipe.getAll.prefetch();
  void api.ingredient.getAll.prefetch();

  return (
    <HydrateClient>
      <CookingForm cookingId={Number(id)} />
    </HydrateClient>
  );
}
