"use client";

import { columns } from "@/app/servings/columns";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";

export default function AllServingsTable() {
  const { data, isPending } = api.serving.getAll.useQuery();
  const { data: personas } = api.persona.getAll.useQuery();

  return (
    <DataTable
      columns={columns}
      data={data ?? []}
      options={personas?.map((persona) => persona.name) ?? []}
      loading={isPending}
    />
  );
}
