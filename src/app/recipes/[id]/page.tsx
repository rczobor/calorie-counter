import RecipeForm from "@/app/recipes/form";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;

  return <RecipeForm id={Number(id)} />;
}
