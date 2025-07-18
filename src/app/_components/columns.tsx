"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import AddButton from "@/components/add-button";
import EditButton from "@/components/edit-button";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { requiredNumberInputSchema } from "@/components/utils";
import { useGetTodayDate } from "@/hooks/use-get-today-date";
import type { Persona } from "@/server/db/schema";
import { api } from "@/trpc/react";
import PersonaRemainingCaloriesCell from "./remaining-calories-cell";

const formSchema = z.object({
	name: z.string().min(1, { error: "Required" }),
	calories: requiredNumberInputSchema(),
});

type FormValues = z.infer<typeof formSchema>;

const ActionButtonCell = ({ personaId }: { personaId: number }) => {
	const { startOfToday, endOfToday } = useGetTodayDate();
	const { mutateAsync, isPending } = api.quickServing.create.useMutation();
	const [open, setOpen] = useState(false);
	const form = useForm({
		defaultValues: {
			name: "",
			calories: "",
		},
		resolver: zodResolver(formSchema),
	});
	const utils = api.useUtils();
	const router = useRouter();

	const onSubmit = async (values: FormValues) => {
		await mutateAsync({ 
			personaId, 
			name: values.name,
			calories: Number(values.calories)
		});
		form.reset();
		void utils.persona.getPersonaCalories.invalidate({
			personaId,
			startDate: startOfToday,
			endDate: endOfToday,
		});
		void utils.persona.getServingsById.invalidate({
			personaId,
			startDate: startOfToday,
			endDate: endOfToday,
		});
		setOpen(false);
		toast.success("Quick serving added");
	};

	return (
		<div className="flex justify-end gap-2">
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<AddButton />
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Quick Serving</DialogTitle>
						<DialogDescription />
					</DialogHeader>

					<Form {...form}>
						<form
							className="flex flex-col gap-2"
							onSubmit={form.handleSubmit(onSubmit)}
						>
							<FormField
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="Name" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								name="calories"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Calories</FormLabel>
										<FormControl>
											<Input
												placeholder="Kcal"
												type="number"
												pattern="[0-9]*"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<DialogFooter>
								<div className="self-end pt-2">
									<Button type="submit" disabled={isPending}>
										{isPending ? (
											<span className="flex items-center gap-2">
												<Loader className="h-4 w-4 animate-spin" />
											</span>
										) : (
											"Save"
										)}
									</Button>
								</div>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
			<EditButton onClick={() => router.push(`/personas/${personaId}`)} />
		</div>
	);
};

export const columns: ColumnDef<Persona>[] = [
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "targetDailyCalories", header: "Target" },
	{
		id: "caloriesLeft",
		header: "Remaining",
		cell: ({ row }) => (
			<PersonaRemainingCaloriesCell personaId={row.original.id} />
		),
	},
	{
		id: "actions",
		cell: ({ row }) => <ActionButtonCell personaId={row.original.id} />,
	},
];
