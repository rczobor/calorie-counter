"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
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
import { api } from "@/trpc/react";

const formSchema = z.object({
	name: z.string().min(1, { message: "Required" }),
	targetDailyCalories: requiredNumberInputSchema(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PersonaForm({ id }: { id?: number }) {
	const isEdit = id != null;
	const { data: persona } = api.persona.getById.useQuery(
		{ id },
		{ enabled: isEdit },
	);
	const form = useForm({
		defaultValues: {
			name: "",
			targetDailyCalories: "",
		},
		resolver: zodResolver(formSchema),
	});
	const utils = api.useUtils();
	const router = useRouter();
	const createPersona = api.persona.create.useMutation({
		onSuccess: (res) => {
			void utils.recipe.getAll.invalidate();
			void utils.persona.getAll.invalidate();
			router.push(`/personas/${res.id}`);
			toast.success("Persona created");
		},
	});
	const updatePersona = api.persona.update.useMutation({
		onSuccess: () => {
			void utils.recipe.getAll.invalidate();
			void utils.persona.getAll.invalidate();
			toast.success("Persona updated");
		},
	});
	const deletePersona = api.persona.delete.useMutation({
		onSuccess: () => {
			void utils.recipe.getAll.invalidate();
			void utils.persona.getAll.invalidate();
			router.push("/personas");
			toast.success("Persona deleted");
		},
	});

	const isPending =
		createPersona.isPending ||
		updatePersona.isPending ||
		deletePersona.isPending;

	useEffect(() => {
		if (!isEdit || !persona) return;
		form.reset({
			name: persona.name,
			targetDailyCalories: persona.targetDailyCalories?.toString() ?? "",
		});
	}, [form, isEdit, persona]);

	const onSubmit = (data: FormValues) => {
		if (isEdit) {
			updatePersona.mutate({ id, ...data, targetDailyCalories: Number(data.targetDailyCalories) });
			return;
		}
		createPersona.mutate({ ...data, targetDailyCalories: Number(data.targetDailyCalories) });
	};

	const onDelete = () => {
		if (!persona) return;
		deletePersona.mutate({ id: persona.id });
	};

	return (
		<Form {...form}>
			<form
				className="container mx-auto flex flex-col px-4"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<div className="flex items-center gap-2 py-4">
					<h1 className="font-bold text-2xl">
						{isEdit ? "Edit Persona" : "Create Persona"}
					</h1>
					<Button type="submit" className="ml-auto" disabled={isPending}>
						{createPersona.isPending || updatePersona.isPending ? (
							<span className="flex items-center gap-2">
								<Loader className="h-4 w-4 animate-spin" />
							</span>
						) : (
							"Save"
						)}
					</Button>
					{isEdit && <DeleteConfirmDialog onDelete={onDelete} />}
				</div>

				<div className="flex flex-col gap-2">
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
						name="targetDailyCalories"
						render={({ field }) => (
							<FormItem className="flex flex-col">
								<FormLabel>Target Daily Calories</FormLabel>
								<FormControl>
									<Input
										placeholder="Target Daily Calories"
										type="number"
										pattern="[0-9]*"
										min={0}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
			</form>
		</Form>
	);
}
