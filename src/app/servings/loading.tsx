import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";

export default function Loading() {
  return (
    <div className="container mx-auto flex flex-col px-4">
      <DataTable columns={columns} loading={true} />
    </div>
  );
}
