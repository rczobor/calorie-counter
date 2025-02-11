"use client";

import CreateIngredientDialog from "@/app/ingredients/create-dialog";
import AddButton from "@/components/add-button";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import MinusButton from "@/components/remove-button";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Ingredient, recipeCategories } from "@/server/db/schema";
import { api } from "@/trpc/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const formSchema = z.object({
  ingredients: z.array(
    z.object({
      id: z.number(),
      name: z.string().min(1, { message: "Required" }),
      caloriesPer100g: z
        .string()
        .min(1, { message: "Required" })
        .pipe(z.coerce.number().min(0))
        .or(z.number().min(0)),
      quantityGrams: z
        .string()
        .min(1, { message: "Required" })
        .pipe(z.coerce.number().min(0)),
    }),
  ),
  name: z.string().min(1, { message: "Required" }),
  description: z.string(),
  category: z.enum(recipeCategories),
});

const defaultValues = {
  ingredients: [],
  name: "",
  description: "",
  category: undefined,
};

type FormValues = z.infer<typeof formSchema>;

export default function RecipeForm({ id }: { id?: number }) {
  const isEdit = id != null;
  const { data: recipe } = api.recipe.getByIdWithRelations.useQuery(
    { id },
    { enabled: isEdit },
  );
  const form = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });
  const utils = api.useUtils();
  const router = useRouter();
  const createRecipe = api.recipe.create.useMutation({
    onSuccess: (res) => {
      void utils.recipe.getAll.invalidate();
      router.push(`/recipes/${res.id}`);
      toast.success("Recipe created");
    },
  });
  const updateRecipe = api.recipe.update.useMutation({
    onSuccess: () => {
      void utils.recipe.getAll.invalidate();
      toast.success("Recipe updated");
    },
  });
  const deleteRecipe = api.recipe.delete.useMutation({
    onSuccess: () => {
      void utils.recipe.getAll.invalidate();
      router.push("/recipes");
      toast.success("Recipe deleted");
    },
  });

  const isPending =
    createRecipe.isPending || updateRecipe.isPending || deleteRecipe.isPending;

  useEffect(() => {
    if (!isEdit || !recipe) return;
    form.reset({
      name: recipe.name,
      category: recipe.category,
      description: recipe.description ?? "",
      ingredients: recipe.recipesToIngredients.map((recipesToIngredient) => ({
        id: recipesToIngredient.ingredient.id,
        name: recipesToIngredient.ingredient.name,
        caloriesPer100g: recipesToIngredient.ingredient.caloriesPer100g,
        quantityGrams:
          recipesToIngredient.quantityGrams.toString() as unknown as number,
      })),
    });
  }, [form, isEdit, recipe]);

  const onSubmit = (data: FormValues) => {
    if (isEdit) {
      updateRecipe.mutate({ id, ...data });
      return;
    }
    createRecipe.mutate(data);
  };

  const onDelete = () => {
    if (!recipe) return;
    deleteRecipe.mutate({ id: recipe.id });
  };

  return (
    <Form {...form}>
      <form
        className="container mx-auto flex flex-col px-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="flex items-center gap-2 py-4">
          <h1 className="text-2xl font-bold">
            {isEdit ? "Edit Recipe" : "Create Recipe"}
          </h1>
          <Button type="submit" className="ml-auto" disabled={isPending}>
            {createRecipe.isPending || updateRecipe.isPending ? (
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
                  <Input {...field} placeholder="Name" />
                </FormControl>
                <FormMessage />
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
                    {recipeCategories.map((cat) => (
                      <SelectItem value={cat} key={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <IngredientSearch />

          <FormField
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Description" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}

function IngredientSearch() {
  const { data, isPending } = api.ingredient.getAll.useQuery();
  const form = useFormContext<FormValues>();
  const fieldArray = useFieldArray({
    control: form.control,
    name: "ingredients",
    keyName: "_id",
  });
  const columns: ColumnDef<Ingredient>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "caloriesPer100g", header: "Calories" },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <AddButton
            onClick={() => {
              const ingredient = row.original;
              fieldArray.append({
                id: ingredient.id,
                name: ingredient.name,
                caloriesPer100g: ingredient.caloriesPer100g,
                quantityGrams: "" as unknown as number,
              });
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2>Ingredients</h2>
        <CreateIngredientDialog
          onCreate={(ingredient) =>
            fieldArray.append({
              id: ingredient.id,
              name: ingredient.name,
              caloriesPer100g: ingredient.caloriesPer100g,
              quantityGrams: "" as unknown as number,
            })
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        {fieldArray.fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <FormField
              name={`ingredients.${index}.quantityGrams`}
              render={({ field }) => (
                <FormItem className="w-24">
                  <FormControl>
                    <Input placeholder="Quantity" type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>{field.name}</div>
            <div className="ml-auto">{field.caloriesPer100g}</div>
            <div className="flex justify-end gap-2">
              <MinusButton
                onClick={() => {
                  fieldArray.remove(index);
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={
          data?.filter(({ id }) =>
            fieldArray.fields.every((field) => field.id !== id),
          ) ?? []
        }
        nameSearch
        loading={isPending}
      />
    </section>
  );
}
