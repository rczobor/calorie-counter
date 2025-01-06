import CookingForm from "@/app/cookings/form";
import { api, HydrateClient } from "@/trpc/server";

export default async function CreateCooking() {
  await api.ingredient.getAll.prefetch();
  await api.recipe.getAll.prefetch();

  return (
    <HydrateClient>
      <CookingForm />
    </HydrateClient>
  );
}
