"use client";

import { columns } from "@/app/servings/columns";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/trpc/react";

export default function AllServingsTable() {
	const [data] = api.serving.getAll.useSuspenseQuery();
	const [personas] = api.persona.getAll.useSuspenseQuery();

	return (
		<DataTable
			columns={columns}
			data={data ?? []}
			options={personas?.map((persona) => persona.name) ?? []}
		/>
	);
}
