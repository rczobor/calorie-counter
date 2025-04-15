import { DataTable } from "@/components/ui/data-table";
import { columns } from "../columns";

export default function Loading() {
	return (
		<div className="container mx-auto flex flex-col px-4">
			<div className="flex items-center justify-between py-4">
				<h1 className="font-bold text-2xl">Cooking</h1>
			</div>
			<DataTable columns={columns} loading={true} />
		</div>
	);
}
