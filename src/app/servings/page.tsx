import AllServingsTable from "@/app/servings/table";
import { api, HydrateClient } from "@/trpc/server";

export default async function AllServingsPage() {
  void api.serving.getAll.prefetch();
  void api.persona.getAll.prefetch();

  return (
    <HydrateClient>
      <div className="container mx-auto flex flex-col px-4">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold">Servings</h1>
        </div>

        <AllServingsTable />
      </div>
    </HydrateClient>
  );
}
