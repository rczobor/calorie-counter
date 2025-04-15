import AllServingsTable from "@/app/servings/table";
import { DataTable } from "@/components/ui/data-table";
import { HydrateClient, api } from "@/trpc/server";
import { Suspense } from "react";
import { columns } from "./columns";

export default function AllServingsPage() {
	void api.serving.getAll.prefetch();
	void api.persona.getAll.prefetch();

	return (
		<div className="container mx-auto flex flex-col px-4">
			<div className="flex items-center justify-between py-4">
				<h1 className="font-bold text-2xl">Servings</h1>
			</div>

			<HydrateClient>
				<Suspense fallback={<DataTable columns={columns} loading={true} />}>
					<AllServingsTable />
				</Suspense>
			</HydrateClient>
		</div>
	);
}
