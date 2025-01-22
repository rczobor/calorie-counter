"use client";

import { DataTable } from "@/components/ui/data-table";
import { useGetTodayDate } from "@/hooks/use-get-today-date";
import { api } from "@/trpc/react";

export default function PersonaServingsList({ id }: { id: number }) {
  const { startOfToday, endOfToday } = useGetTodayDate();
  const { data, isPending } = api.persona.getServingsById.useQuery({
    id,
    startDate: startOfToday,
    endDate: endOfToday,
  });

  return (
    <div className="container mx-auto flex flex-col gap-2 px-4">
      <h2 className="text-xl font-bold">Today&apos;s Servings</h2>

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
