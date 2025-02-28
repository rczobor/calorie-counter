import PersonaTable from "@/app/personas/table";
import AddButton from "@/components/add-button";
import { api, HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import Link from "next/link";

export default function PersonasPage() {
  void api.persona.getAll.prefetch();

  return (
    <div className="container mx-auto flex flex-col px-4">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold">Personas</h1>
        <Link href="/personas/create">
          <AddButton variant={"default"} />
        </Link>
      </div>
      <HydrateClient>
        <Suspense fallback={<DataTable columns={columns} loading={true} />}>
          <PersonaTable />
        </Suspense>
      </HydrateClient>
    </div>
  );
}
