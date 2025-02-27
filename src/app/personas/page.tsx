import PersonaTable from "@/app/personas/table";
import AddButton from "@/components/add-button";
import Link from "next/link";

export default async function PersonasPage() {
  return (
    <div className="container mx-auto flex flex-col px-4">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold">Personas</h1>
        <Link href="/personas/create">
          <AddButton variant={"default"} />
        </Link>
      </div>
      <PersonaTable />
    </div>
  );
}
