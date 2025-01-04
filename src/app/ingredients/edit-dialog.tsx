"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Ingredient, ingredientCategories } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { Loader, Trash } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  name: z.string().min(1, { message: "Required" }),
  caloriesPer100g: z
    .string()
    .min(1, { message: "Required" })
    .pipe(z.coerce.number().min(0)),
  category: z.enum(ingredientCategories),
});

const defaultValues = {
  name: "",
  caloriesPer100g: "",
  category: undefined,
} as unknown as FormValues;

type FormValues = z.infer<typeof formSchema>;

export default function EditIngredientDialog({
  ingredient,
  open,
  onCloseAction,
}: {
  ingredient: Ingredient | null;
  open: boolean;
  onCloseAction: () => void;
}) {
  const form = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });
  const utils = api.useUtils();
  const updateIngredient = api.ingredient.update.useMutation({
    onSuccess: async () => {
      await utils.ingredient.getAll.invalidate();
      onCloseAction();
    },
  });
  const deleteIngredient = api.ingredient.delete.useMutation({
    onSuccess: async () => {
      await utils.ingredient.getAll.invalidate();
      onCloseAction();
    },
  });

  useEffect(() => {
    if (!open || !ingredient) return;

    form.reset({
      name: ingredient.name,
      caloriesPer100g: String(ingredient.caloriesPer100g),
      category: ingredient.category,
    } as unknown as FormValues);
  }, [form, ingredient, open]);

  const onSubmit = (data: FormValues) => {
    if (!ingredient) return;
    const id = ingredient.id;
    updateIngredient.mutate({ id, ...data });
  };

  const onDelete = () => {
    if (!ingredient) return;
    deleteIngredient.mutate({ id: ingredient.id });
  };

  const isAnythingPending =
    updateIngredient.isPending || deleteIngredient.isPending;

  return (
    <Dialog open={open} onOpenChange={onCloseAction}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Edit Ingredient</DialogTitle>
          <DialogDescription></DialogDescription>
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
                </FormItem>
              )}
            />

            <FormField
              name="caloriesPer100g"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Calories per 100g</FormLabel>
                  <FormControl>
                    <Input placeholder="Calories per 100g" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              name="category"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Category</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value as string | undefined}
                  >
                    <FormControl>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      {ingredientCategories.map((cat) => (
                        <SelectItem value={cat} key={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <DialogFooter>
              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={isAnythingPending}>
                  {updateIngredient.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader className="h-4 w-4 animate-spin" />
                    </span>
                  ) : (
                    "Save"
                  )}
                </Button>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Ingredient</DialogTitle>
                      <DialogDescription></DialogDescription>
                    </DialogHeader>

                    <DialogFooter>
                      <div className="flex justify-end gap-2">
                        <DialogClose asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={onDelete}
                          >
                            Delete
                          </Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button type="button">Cancel</Button>
                        </DialogClose>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}