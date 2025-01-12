import PersonaForm from "@/app/personas/form";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);

  return <PersonaForm id={Number(id)} />;
}
