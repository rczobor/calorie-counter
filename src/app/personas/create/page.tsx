import PersonaForm from "@/app/personas/form";
import { HydrateClient } from "@/trpc/server";

export default async function PersonaCreatePage() {
  return (
    <HydrateClient>
      <PersonaForm />
    </HydrateClient>
  );
}
