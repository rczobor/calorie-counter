"use client";

import { columns as recipeColumns } from "@/app/recipes/columns";
import { columns as ingredientColumns } from "@/app/ingredients/columns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  type Ingredient,
  ingredientCategories,
  type Recipe,
  recipeCategories,
} from "@/server/db/schema";
import { api } from "@/trpc/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type DefaultValues,
  useFieldArray,
  useForm,
  useFormContext,
} from "react-hook-form";
import { z } from "zod";
import CreateIngredientDialog from "@/app/ingredients/create-dialog";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";
import { toast } from "sonner";
import AddButton from "@/components/add-button";

const formSchema = z.object({
  name: z.string().min(1, { message: "Required" }),
  cookedRecipes: z.array(
    z.object({
      id: z.number().optional(),
      recipeId: z.number().nullish(),
      name: z.string().min(1, { message: "Required" }),
      description: z.string(),
      finalWeightGrams: z.number().min(1),
      cookedRecipeIngredients: z.array(
        z.object({
          id: z.number().optional(),
          ingredientId: z.number(),
          name: z.string().min(1, { message: "Required" }),
          quantityGrams: z.number().min(0),
          caloriesPer100g: z.number().min(0),
        }),
      ),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues = {
  name: "",
  cookedRecipes: [],
} satisfies DefaultValues<FormValues>;

export default function CookingForm({ cookingId }: { cookingId?: number }) {
  const isEdit = cookingId != null;
  const { data: cooking } = api.cooking.getByIdWithRelations.useQuery(
    { id: cookingId },
    { enabled: isEdit },
  );
  const [addRecipeOpen, setAddRecipeOpen] = useState(false);
  const { data: recipes, isPending: isRecipePending } =
    api.recipe.getAll.useQuery();
  const form = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });
  const recipesFieldArray = useFieldArray({
    control: form.control,
    name: "cookedRecipes",
    keyName: "_id",
  });
  const utils = api.useUtils();
  const router = useRouter();
  const createCooking = api.cooking.create.useMutation({
    onSuccess: (res) => {
      void utils.cooking.getAll.invalidate();
      router.push(`/cookings/${res.id}`);
      toast.success("Cooking created");
    },
  });
  const deleteCooking = api.cooking.delete.useMutation({
    onSuccess: () => {
      void utils.cooking.getAll.invalidate();
      router.push("/cookings");
      toast.success("Cooking deleted");
    },
  });
  const updateCooking = api.cooking.update.useMutation({
    onSuccess: () => {
      void utils.cooking.getAll.invalidate();
      void utils.cooking.getByIdWithRelations.invalidate({ id: cookingId });
      toast.success("Cooking updated");
    },
  });
  const isMutationPending =
    createCooking.isPending ||
    updateCooking.isPending ||
    deleteCooking.isPending;

  useEffect(() => {
    if (!isEdit || !cooking) return;
    form.reset({
      name: cooking.name,
      cookedRecipes: cooking.cookedRecipes.map((cookedRecipe) => ({
        id: cookedRecipe.id,
        recipeId: cookedRecipe.recipeId,
        name: cookedRecipe.name,
        description: cookedRecipe.description,
        finalWeightGrams: cookedRecipe.finalWeightGrams,
        cookedRecipeIngredients: cookedRecipe.cookedRecipeIngredients.map(
          (cookedRecipeIngredient) => ({
            ingredientId: cookedRecipeIngredient.ingredientId,
            name: cookedRecipeIngredient.ingredient.name,
            quantityGrams: cookedRecipeIngredient.quantityGrams,
            caloriesPer100g: cookedRecipeIngredient.caloriesPer100g,
          }),
        ),
      })),
    });
  }, [cooking, form, isEdit]);

  const onSubmit = async (data: FormValues) => {
    if (isEdit) {
      updateCooking.mutate({ id: cookingId, ...data });
      return;
    }
    createCooking.mutate(data);
  };

  const addExistingRecipe = async (recipe: Recipe) => {
    const recipeWithIngredients = await utils.recipe.getByIdWithRelations.fetch(
      { id: recipe.id },
    );

    if (!recipeWithIngredients) return;

    recipesFieldArray.append({
      recipeId: recipeWithIngredients.id,
      name: recipeWithIngredients.name,
      description: recipeWithIngredients.description,
      finalWeightGrams: 0,
      cookedRecipeIngredients: recipeWithIngredients.recipesToIngredients.map(
        (recipesToIngredient) => ({
          ingredientId: recipesToIngredient.ingredientId,
          name: recipesToIngredient.ingredient.name,
          quantityGrams: recipesToIngredient.quantityGrams,
          caloriesPer100g: recipesToIngredient.ingredient.caloriesPer100g,
        }),
      ),
    });

    setAddRecipeOpen(false);
  };

  const addNewRecipe = () => {
    recipesFieldArray.append({
      name: "",
      description: "",
      finalWeightGrams: 0,
      cookedRecipeIngredients: [],
    });

    setAddRecipeOpen(false);
  };

  const onDelete = () => {
    if (!isEdit) return;
    deleteCooking.mutate({ id: cookingId });
  };

  return (
    <Form {...form}>
      <form
        className="container mx-auto flex flex-col gap-2 px-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="flex items-center gap-2 pt-4">
          <h1 className="text-2xl font-bold">
            {isEdit ? "Edit Cooking" : "Create Cooking"}
          </h1>
          <Button
            type="submit"
            className="ml-auto"
            disabled={isMutationPending}
          >
            {createCooking.isPending || updateCooking.isPending ? (
              <span className="flex items-center gap-2">
                <Loader className="h-4 w-4 animate-spin" />
              </span>
            ) : (
              "Save"
            )}
          </Button>
          {isEdit && <DeleteConfirmDialog onDelete={onDelete} />}
        </div>

        {isEdit && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => router.push(`/cookings/${cookingId}/servings`)}
            >
              Servings
            </Button>
          </div>
        )}

        <FormField
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cooking Name</FormLabel>
              <FormControl>
                <Input placeholder="Name" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Recipes</h2>
            <Dialog open={addRecipeOpen} onOpenChange={setAddRecipeOpen}>
              <DialogTrigger asChild>
                <AddButton />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Recipe</DialogTitle>
                  <DialogDescription />
                </DialogHeader>

                <div className="flex justify-end">
                  <AddButton variant={"default"} onClick={addNewRecipe} />
                </div>

                <DataTable
                  columns={[
                    ...recipeColumns.filter((col) => col.id !== "actions"),
                    {
                      id: "actions",
                      cell: ({ row }) => (
                        <div className="flex justify-end gap-2">
                          <AddButton
                            onClick={() => addExistingRecipe(row.original)}
                          />
                        </div>
                      ),
                    },
                  ]}
                  data={
                    recipes?.filter(({ id }) =>
                      recipesFieldArray.fields.every(
                        (field) => field.recipeId !== id,
                      ),
                    ) ?? []
                  }
                  nameSearch
                  options={recipeCategories}
                  loading={isRecipePending}
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex flex-col gap-2">
            {recipesFieldArray.fields.map((recipe, index) => (
              <Card key={recipe._id} className="p-4">
                <div className="flex items-end gap-2">
                  <FormField
                    name={`cookedRecipes.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recipe Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    name={`cookedRecipes.${index}.finalWeightGrams`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Final Weight</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Final Weight"
                            type="number"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    className="ml-auto"
                    type="button"
                    variant="destructive"
                    onClick={() => recipesFieldArray.remove(index)}
                  >
                    <Trash />
                  </Button>
                </div>

                <FormField
                  name={`cookedRecipes.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipe description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Description" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <CookedRecipeIngredients index={index} />
              </Card>
            ))}
          </div>
        </section>
      </form>
    </Form>
  );
}

function CookedRecipeIngredients({ index: parentIndex }: { index: number }) {
  const [addIngredientOpen, setAddIngredientOpen] = useState(false);
  const { data: ingridients, isPending } = api.ingredient.getAll.useQuery();
  const form = useFormContext<FormValues>();
  const fieldName =
    `cookedRecipes.${parentIndex}.cookedRecipeIngredients` as const;
  const fieldArray = useFieldArray({
    control: form.control,
    name: fieldName,
    keyName: "_id",
  });

  const addExistingIngredient = (ingredient: Ingredient) => {
    fieldArray.append({
      ingredientId: ingredient.id,
      name: ingredient.name,
      quantityGrams: 0,
      caloriesPer100g: ingredient.caloriesPer100g,
    });

    setAddIngredientOpen(false);
  };

  const addNewIngredient = (ingredient: Ingredient) => {
    fieldArray.append({
      ingredientId: ingredient.id,
      name: ingredient.name,
      caloriesPer100g: ingredient.caloriesPer100g,
      quantityGrams: 0,
    });

    setAddIngredientOpen(false);
  };

  return (
    <section className="flex flex-col gap-2 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">Ingredients</h3>
        <Dialog open={addIngredientOpen} onOpenChange={setAddIngredientOpen}>
          <DialogTrigger asChild>
            <AddButton />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Ingredient</DialogTitle>
              <DialogDescription />
            </DialogHeader>
            <div className="flex justify-end">
              <CreateIngredientDialog onCreate={addNewIngredient} />
            </div>

            <DataTable
              columns={[
                ...ingredientColumns.filter((col) => col.id !== "actions"),
                {
                  id: "actions",
                  cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                      <AddButton
                        onClick={() => addExistingIngredient(row.original)}
                      />
                    </div>
                  ),
                },
              ]}
              data={
                ingridients?.filter(({ id }) =>
                  fieldArray.fields.every((field) => field.ingredientId !== id),
                ) ?? []
              }
              nameSearch
              options={ingredientCategories}
              loading={isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
      {fieldArray.fields.map((ingredient, index) => (
        <Card key={ingredient._id} className="p-4">
          <div className="pb-2 text-lg font-bold">{ingredient.name}</div>
          <div className="flex items-end justify-between gap-2">
            <FormField
              name={`${fieldName}.${index}.quantityGrams`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input placeholder="Quantity" type="number" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              name={`${fieldName}.${index}.caloriesPer100g`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Calories</FormLabel>
                  <FormControl>
                    <Input placeholder="Calories" type="number" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="destructive"
              onClick={() => fieldArray.remove(index)}
            >
              <Trash />
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}
