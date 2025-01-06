"use client";

import { columns } from "@/app/servings/columns";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

export default function AllServingsTable() {
  const { data } = api.serving.getAll.useQuery();
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={data ?? []}
      onClick={(serving) =>
        router.push(`/cookings/${serving.cookingId}/servings`)
      }
    />
  );
}
