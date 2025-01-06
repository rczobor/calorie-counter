import CookingForm from "@/app/cookings/form";
import { api, HydrateClient } from "@/trpc/server";

export default async function CookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  await api.cooking.getByIdWithRelations.prefetch({ id: Number(id) });
  return (
    <HydrateClient>
      <CookingForm cookingId={Number(id)} />
    </HydrateClient>
  );
}
