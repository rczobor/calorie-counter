"use client";

import { columns } from "@/app/cookings/columns";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

export default function CookingTable() {
  const { data } = api.cooking.getAll.useQuery();
  const router = useRouter();
  return (
    <DataTable
      columns={columns}
      data={data ?? []}
      onClick={(cooking) => router.push(`/cookings/${cooking.id}`)}
    />
  );
}
