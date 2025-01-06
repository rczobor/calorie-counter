import CookingTable from "@/app/cookings/table";
import { Button } from "@/components/ui/button";
import { api, HydrateClient } from "@/trpc/server";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function Cookings() {
  await api.cooking.getAll.prefetch();

  return (
    <HydrateClient>
      <div className="container mx-auto flex flex-col px-4">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold">Cookings</h1>
          <Link href="/cookings/create">
            <Button>
              <Plus />
            </Button>
          </Link>
        </div>
        <CookingTable />
      </div>
    </HydrateClient>
  );
}
