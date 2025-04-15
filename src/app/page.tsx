import { DataTable } from "@/components/ui/data-table";
import { HydrateClient, api } from "@/trpc/server";
import { Suspense } from "react";
import { columns } from "./_components/columns";
import DashboardTable from "./_components/dashboard-table";

export default async function Home() {
	void api.persona.getAll.prefetch();

	return (
		<div className="container mx-auto flex flex-col p-4">
			<HydrateClient>
				<Suspense fallback={<DataTable columns={columns} loading={true} />}>
					<DashboardTable />
				</Suspense>
			</HydrateClient>
		</div>
	);
}
