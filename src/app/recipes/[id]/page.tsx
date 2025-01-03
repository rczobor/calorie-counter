export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // TODO this page
  const id = (await params).id;
  return <div>Recipe Page {id}</div>;
}
