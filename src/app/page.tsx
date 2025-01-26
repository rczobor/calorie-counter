import { api, HydrateClient } from "@/trpc/server";
import DashboardTable from "./_components/table";
import { Suspense } from "react";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./_components/columns";

export default async function Home() {
  void api.persona.getAll.prefetch();

  return (
    <div className="container mx-auto flex flex-col p-4">
      <HydrateClient>
        <Suspense fallback={<DataTable columns={columns} loading={true} />}>
          <DashboardTable />
        </Suspense>
      </HydrateClient>
    </div>
  );
}
