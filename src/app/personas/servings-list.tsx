"use client";

import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";

export default function PersonaServingsList({ id }: { id: number }) {
  const { data, isPending } = api.persona.getServingsById.useQuery({ id });

  return (
    <div className="container mx-auto flex flex-col gap-2 px-4">
      <h2 className="text-xl font-bold">Servings</h2>

      <DataTable
        columns={[
          { accessorKey: "name", header: "Name" },
          { accessorKey: "calories", header: "Kcal" },
          // TODO add actions column
        ]}
        data={data ?? []}
        loading={isPending}
      />
    </div>
  );
}
