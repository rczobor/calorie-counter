"use client";

import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";
import { columns } from "./columns";

export default function DashboardTable() {
	const [data] = api.persona.getAll.useSuspenseQuery();

	return <DataTable columns={columns} data={data} />;
}
