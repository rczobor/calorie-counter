export default async function CookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  return <div>Cooking Page {id}</div>;
}
