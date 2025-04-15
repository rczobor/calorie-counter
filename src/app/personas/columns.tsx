"use client";

import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import EditButton from "@/components/edit-button";
import type { Persona } from "@/server/db/schema";
import { api } from "@/trpc/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { toast } from "sonner";
import PersonaRemainingCaloriesCell from "../_components/remaining-calories-cell";

export const columns: ColumnDef<Persona>[] = [
	{
		accessorKey: "name",
		header: "Name",
	},
	{
		accessorKey: "targetDailyCalories",
		header: "Target Daily Calories",
	},
	{
		id: "caloriesLeft",
		header: "Remaining",
		cell: ({ row }) => (
			<PersonaRemainingCaloriesCell personaId={row.original.id} />
		),
	},
	{
		id: "actions",
		cell: ({ row }) => <ActionButtonColumn persona={row.original} />,
	},
];

const ActionButtonColumn = ({ persona }: { persona: Persona }) => {
	const utils = api.useUtils();
	const { mutate } = api.cooking.delete.useMutation({
		onSuccess: () => {
			void utils.cooking.getAll.invalidate();
			toast.success("Cooking deleted");
		},
	});

	return (
		<div className="flex justify-end gap-2">
			<Link href={`/personas/${persona.id}`}>
				<EditButton />
			</Link>
			<DeleteConfirmDialog onDelete={() => mutate({ id: persona.id })} />
		</div>
	);
};
