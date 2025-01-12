import CreateServingForm from "@/app/cookings/[id]/servings/create-form";
import ServingList from "@/app/cookings/[id]/servings/list";

export default async function ServingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookingId = Number((await params).id);

  return (
    <>
      <CreateServingForm cookingId={cookingId} />
      <ServingList cookingId={cookingId} />
    </>
  );
}
