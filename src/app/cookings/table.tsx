"use client";

import { columns } from "@/app/cookings/columns";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";

export default function CookingTable() {
  const [data, { isPending }] = api.cooking.getAll.useSuspenseQuery();

  return <DataTable columns={columns} data={data ?? []} loading={isPending} />;
}
