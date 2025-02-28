"use client";

import { columns } from "@/app/personas/columns";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";

export default function PersonaTable() {
  const [data, { isPending }] = api.persona.getAll.useSuspenseQuery();

  return <DataTable columns={columns} data={data ?? []} loading={isPending} />;
}
