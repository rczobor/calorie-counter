import CreateServingForm from "@/app/cookings/[id]/servings/create-form";
import ServingList from "@/app/cookings/[id]/servings/list";
import { api, HydrateClient } from "@/trpc/server";

export default async function CreateServingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookingId = Number((await params).id);

  void api.cooking.getByIdWithRelations.prefetch({ id: cookingId });
  void api.serving.getByCooking.prefetch({ cookingId });
  void api.persona.getAll.prefetch();

  return (
    <div className="container mx-auto flex flex-col px-4">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold">Servings</h1>
      </div>
      <HydrateClient>
        <CreateServingForm cookingId={cookingId} />
        <ServingList cookingId={cookingId} />
      </HydrateClient>
    </div>
  );
}
