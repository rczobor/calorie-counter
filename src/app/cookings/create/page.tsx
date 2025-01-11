import CookingForm from "@/app/cookings/form";
import { api, HydrateClient } from "@/trpc/server";

export default async function CreateCooking() {
  void api.ingredient.getAll.prefetch();
  void api.recipe.getAll.prefetch();

  return (
    <HydrateClient>
      <CookingForm />
    </HydrateClient>
  );
}
