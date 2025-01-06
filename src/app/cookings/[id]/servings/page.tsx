import CreateServingForm from "@/app/cookings/[id]/servings/create-form";
import ServingList from "@/app/cookings/[id]/servings/list";
import { api, HydrateClient } from "@/trpc/server";

export default async function ServingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookingId = Number((await params).id);

  await api.cooking.getByIdWithRelations.prefetch({ id: cookingId });
  await api.serving.getByCooking.prefetch({ cookingId });
  await api.persona.getAll.prefetch();

  return (
    <HydrateClient>
      <CreateServingForm cookingId={cookingId} />
      <ServingList cookingId={cookingId} />
    </HydrateClient>
  );
}
