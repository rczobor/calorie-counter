import CookingForm from "@/app/cookings/form";

export default async function CookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;

  return <CookingForm cookingId={Number(id)} />;
}
