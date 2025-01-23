"use client";

import { DataTable } from "@/components/ui/data-table";
import { useGetTodayDate } from "@/hooks/use-get-today-date";
import { api } from "@/trpc/react";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import { type ColumnDef } from "@tanstack/react-table";

type Serving = {
  id: number;
  name: string | null;
  calories: number;
  isQuickServing: boolean;
};

export default function PersonaServingsList({
  personaId,
}: {
  personaId: number;
}) {
  const { startOfToday, endOfToday } = useGetTodayDate();
  const { data, isPending } = api.persona.getServingsById.useQuery({
    personaId,
    startDate: startOfToday,
    endDate: endOfToday,
  });

  const utils = api.useUtils();
  const deleteServing = api.serving.delete.useMutation({
    onSuccess: () => {
      void utils.persona.getServingsById.invalidate({
        personaId,
        startDate: startOfToday,
        endDate: endOfToday,
      });
      void utils.persona.getPersonaCalories.invalidate({
        personaId,
        startDate: startOfToday,
        endDate: endOfToday,
      });
    },
  });

  const deleteQuickServing = api.quickServing.delete.useMutation({
    onSuccess: () => {
      void utils.persona.getServingsById.invalidate({
        personaId,
        startDate: startOfToday,
        endDate: endOfToday,
      });
      void utils.persona.getPersonaCalories.invalidate({
        personaId,
        startDate: startOfToday,
        endDate: endOfToday,
      });
    },
  });

  const onDelete = (serving: Serving) => {
    if (serving.isQuickServing) {
      deleteQuickServing.mutate({ id: serving.id });
    } else {
      deleteServing.mutate({ id: serving.id });
    }
  };

  const columns: ColumnDef<Serving>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "calories", header: "Kcal" },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <DeleteConfirmDialog onDelete={() => onDelete(row.original)} />
        </div>
      ),
    },
  ];

  return (
    <div className="container mx-auto flex flex-col gap-2 px-4">
      <h2 className="text-xl font-bold">Today&apos;s Servings</h2>

      <DataTable columns={columns} data={data ?? []} loading={isPending} />
    </div>
  );
}
