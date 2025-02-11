import RecipeTable from "@/app/recipes/table";
import AddButton from "@/components/add-button";
import Link from "next/link";
import { api, HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";

export default function Recipes() {
  void api.recipe.getAll.prefetch();

  return (
    <div className="container mx-auto flex flex-col px-4">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <Link href="/recipes/create">
          <AddButton variant="default" />
        </Link>
      </div>
      <HydrateClient>
        <Suspense fallback={<DataTable columns={columns} loading={true} />}>
          <RecipeTable />
        </Suspense>
      </HydrateClient>
    </div>
  );
}
