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
import { Loader, Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";
import { z } from "zod";
import CreateIngredientDialog from "@/app/ingredients/create-dialog";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import DeleteConfirmDialog from "@/components/delete-confirm-dialog";

const formSchema = z.object({
  name: z.string().min(1, { message: "Required" }),
  cookedRecipes: z.array(
    z.object({
      id: z.number().optional(),
      recipeId: z.number().nullish(),
      name: z.string().min(1, { message: "Required" }),
      description: z.string(),
      finalWeightGrams: z.coerce.number().min(0),
      cookedRecipeIngredients: z.array(
        z.object({
          id: z.number().optional(),
          ingredientId: z.number(),
          name: z.string().min(1, { message: "Required" }),
          quantityGrams: z.coerce.number().min(0),
          caloriesPer100g: z.coerce.number().min(0),
        }),
      ),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues = {
  name: "",
  cookedRecipes: [],
};

export default function CookingForm({ cookingId }: { cookingId?: number }) {
  const isEdit = cookingId != null;
  const { data: cooking } = api.cooking.getByIdWithRelations.useQuery(
    { id: cookingId ?? -1 },
    { enabled: isEdit },
  );
  const [addRecipeOpen, setAddRecipeOpen] = useState(false);
  const { data: recipes } = api.recipe.getAll.useQuery();
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
    onSuccess: async (res) => {
      await utils.cooking.getAll.invalidate();
      router.push(`/cookings/${res.id}`);
    },
  });
  const deleteCooking = api.cooking.delete.useMutation({
    onSuccess: async () => {
      await utils.cooking.getAll.invalidate();
      router.push("/cookings");
    },
  });
  const updateCooking = api.cooking.update.useMutation({
    onSuccess: async () => {
      await utils.cooking.getAll.invalidate();
    },
  });
  const isPending =
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
        finalWeightGrams:
          cookedRecipe.finalWeightGrams.toString() as unknown as number,
        cookedRecipeIngredients: cookedRecipe.cookedRecipeIngredients.map(
          (cookedRecipeIngredient) => ({
            ingredientId: cookedRecipeIngredient.ingredientId,
            name: cookedRecipeIngredient.ingredient.name,
            quantityGrams:
              cookedRecipeIngredient.quantityGrams.toString() as unknown as number,
            caloriesPer100g:
              cookedRecipeIngredient.caloriesPer100g.toString() as unknown as number,
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
      finalWeightGrams: "" as unknown as number,
      cookedRecipeIngredients: recipeWithIngredients.recipesToIngredients.map(
        (recipesToIngredient) => ({
          ingredientId: recipesToIngredient.ingredientId,
          name: recipesToIngredient.ingredient.name,
          quantityGrams:
            recipesToIngredient.quantityGrams.toString() as unknown as number,
          caloriesPer100g:
            recipesToIngredient.ingredient.caloriesPer100g.toString() as unknown as number,
        }),
      ),
    });

    setAddRecipeOpen(false);
  };

  const addNewRecipe = () => {
    recipesFieldArray.append({
      name: "",
      description: "",
      finalWeightGrams: "" as unknown as number,
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
          <Button type="submit" className="ml-auto" disabled={isPending}>
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
                <Button type="button" variant="secondary">
                  <Plus />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Recipe</DialogTitle>
                  <DialogDescription />
                </DialogHeader>

                <div className="flex justify-end">
                  <Button type="button" onClick={addNewRecipe}>
                    <Plus />
                  </Button>
                </div>

                <DataTable
                  columns={recipeColumns}
                  data={
                    recipes?.filter(({ id }) =>
                      recipesFieldArray.fields.every(
                        (field) => field.id !== id,
                      ),
                    ) ?? []
                  }
                  nameSearch
                  options={recipeCategories}
                  onClick={addExistingRecipe}
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
                          <Input placeholder="Final Weight" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
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
  const { data: ingridients } = api.ingredient.getAll.useQuery();
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
      quantityGrams: "" as unknown as number,
      caloriesPer100g:
        ingredient.caloriesPer100g.toString() as unknown as number,
    });

    setAddIngredientOpen(false);
  };

  const addNewIngredient = (ingredient: Ingredient) => {
    fieldArray.append({
      ingredientId: ingredient.id,
      name: ingredient.name,
      caloriesPer100g: ingredient.caloriesPer100g,
      quantityGrams: "" as unknown as number,
    });

    setAddIngredientOpen(false);
  };

  return (
    <section className="flex flex-col gap-2 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">Ingredients</h3>
        <Dialog open={addIngredientOpen} onOpenChange={setAddIngredientOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary">
              <Plus />
            </Button>
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
              columns={ingredientColumns}
              data={
                ingridients?.filter(({ id }) =>
                  fieldArray.fields.every((field) => field.ingredientId !== id),
                ) ?? []
              }
              nameSearch
              options={ingredientCategories}
              onClick={addExistingIngredient}
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
                    <Input placeholder="Quantity" {...field} />
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
                    <Input placeholder="Calories" {...field} />
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
