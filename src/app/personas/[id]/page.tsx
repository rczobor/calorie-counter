import PersonaForm from "@/app/personas/form";
import PersonaServingsList from "../servings-list";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);

  return (
    <div>
      <PersonaForm id={id} />
      <div className="my-4 border-b" />
      <PersonaServingsList personaId={id} />
    </div>
  );
}
