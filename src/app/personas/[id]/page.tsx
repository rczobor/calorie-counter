import PersonaForm from "@/app/personas/form";
import { api, HydrateClient } from "@/trpc/server";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);

  void api.persona.getById.prefetch({ id });

  return (
    <HydrateClient>
      <PersonaForm id={Number(id)} />
    </HydrateClient>
  );
}
