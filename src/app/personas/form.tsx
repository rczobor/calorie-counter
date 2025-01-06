"use client";

import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  name: z.string().min(1, { message: "Required" }),
  targetDailyCalories: z.coerce.number().min(0),
});

const defaultValues = {
  name: "",
  targetDailyCalories: "" as unknown as number,
};

type FormValues = z.infer<typeof formSchema>;

export default function PersonaForm({ id }: { id?: number }) {
  const isEdit = id != null;
  const { data: persona } = api.persona.getById.useQuery(
    { id: id ?? -1 },
    { enabled: isEdit },
  );
  const form = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });
  const utils = api.useUtils();
  const router = useRouter();
  const createPersona = api.persona.create.useMutation({
    onSuccess: async (res) => {
      await utils.recipe.getAll.invalidate();
      router.push(`/personas/${res.id}`);
    },
  });
  const updatePersona = api.persona.update.useMutation({
    onSuccess: async () => {
      await utils.recipe.getAll.invalidate();
    },
  });
  const deletePersona = api.persona.delete.useMutation({
    onSuccess: async () => {
      await utils.recipe.getAll.invalidate();
      router.push("/personas");
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
      targetDailyCalories: (persona.targetDailyCalories?.toString() ??
        "") as unknown as number,
    });
  }, [form, isEdit, persona]);

  const onSubmit = (data: FormValues) => {
    if (isEdit) {
      updatePersona.mutate({ id, ...data });
      return;
    }
    createPersona.mutate(data);
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
          <h1 className="text-2xl font-bold">
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
                    min={0}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}