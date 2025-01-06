"use client";

import { columns } from "@/app/personas/columns";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

export default function PersonaTable() {
  const { data } = api.persona.getAll.useQuery();
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={data ?? []}
      onClick={(persona) => router.push(`/personas/${persona.id}`)}
    />
  );
}
