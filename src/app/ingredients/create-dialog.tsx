"use client";

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
import { Loader, Plus } from "lucide-react";
import { useState } from "react";
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

export default function CreateIngredientDialog({
  onCreate,
}: {
  onCreate?: (ingredient: Ingredient) => void;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });
  const utils = api.useUtils();
  const createIngredient = api.ingredient.create.useMutation({
    onSuccess: async (res) => {
      await utils.ingredient.getAll.invalidate();
      setOpen(false);
      form.reset();
      onCreate?.(res);
    },
  });

  const onSubmit = (data: FormValues) => {
    createIngredient.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
        </Button>
      </DialogTrigger>

      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Add Ingredient</DialogTitle>
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
              <div className="self-end pt-2">
                <Button type="submit" disabled={createIngredient.isPending}>
                  {createIngredient.isPending ? (
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
  );
}