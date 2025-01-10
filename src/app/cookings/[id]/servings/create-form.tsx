"use client";

import { calculateCaloriesPer100g } from "@/app/cookings/[id]/servings/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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
import { api } from "@/trpc/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  name: z.string(),
  personaId: z.coerce.number(),
  portions: z.array(
    z.object({
      cookedRecipeId: z.number(),
      weightGrams: z.coerce.number().min(0),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateServingForm({
  cookingId,
}: {
  cookingId: number;
}) {
  const { data: cooking } = api.cooking.getByIdWithRelations.useQuery({
    id: cookingId,
  });
  const { data: personas } = api.persona.getAll.useQuery();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      personaId: (personas?.[0]?.id.toString() ?? "") as unknown as number,
      portions:
        cooking?.cookedRecipes.map((recipe) => ({
          cookedRecipeId: recipe.id,
          weightGrams: "" as unknown as number,
        })) ?? [],
    },
  });
  const utils = api.useUtils();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const createServing = api.serving.create.useMutation({
    onSuccess: async (res) => {
      await utils.serving.getByCooking.invalidate({ cookingId });
      await utils.serving.getPersonaCalories.invalidate({
        personaId: res.personaId,
        startDate: startOfToday,
        endDate: endOfToday,
      });
      form.reset();
    },
  });

  const { data: personaCalories } = api.serving.getPersonaCalories.useQuery({
    personaId: Number(form.watch("personaId")),
    startDate: startOfToday,
    endDate: endOfToday,
  });

  useEffect(() => {
    if (!personaCalories) return;

    console.log(personaCalories);
  }, [personaCalories]);

  const onSubmit = (data: FormValues) => {
    createServing.mutate({
      cookingId,
      ...data,
    });
  };

  if (!cooking) return null;

  return (
    <Form {...form}>
      <form
        className="container mx-auto flex flex-col gap-2 px-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="Name" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <section className="space-y-2">
          <h3 className="text-lg font-bold">Cooked Recipes</h3>
          {cooking.cookedRecipes.map((recipe, index) => (
            <Card key={recipe.id} className="space-y-2 p-4">
              <div>
                <CardTitle className="font-bold">{recipe.name}</CardTitle>
                <CardDescription>{recipe.description}</CardDescription>
              </div>

              <div className="mt-2 flex justify-between gap-2 border-t-2 py-2">
                <div>Total Weight: {recipe.finalWeightGrams}g</div>
                <div>Kcal/100g: {calculateCaloriesPer100g(recipe)}</div>
              </div>

              <DataTable
                columns={[
                  {
                    accessorKey: "ingredient.name",
                    id: "ingredientName",
                    header: "Ingredient",
                  },
                  { accessorKey: "quantityGrams", header: "Quantity" },
                  { accessorKey: "caloriesPer100g", header: "Kcal/100g" },
                ]}
                data={recipe.cookedRecipeIngredients}
              />

              <div>
                <FormField
                  name={`portions.${index}.weightGrams`}
                  render={({ field }) => (
                    <FormItem className="flex justify-between gap-2">
                      <div>
                        <FormLabel>Portion Weight</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Weight in grams"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </div>

                      <div>
                        <div>Portion kcal</div>
                        <div>
                          {field.value
                            ? Math.round(
                                (field.value *
                                  calculateCaloriesPer100g(recipe)) /
                                  100,
                              )
                            : 0}
                        </div>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </Card>
          ))}
        </section>

        <div className="flex items-end justify-between gap-2">
          <FormField
            name="personaId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Remaining kcal: {personaCalories?.remainingCalories}
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={String(field.value)}
                >
                  <FormControl>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select a persona" />
                    </SelectTrigger>
                  </FormControl>

                  <SelectContent>
                    {personas?.map((persona) => (
                      <SelectItem
                        value={persona.id.toString()}
                        key={persona.id}
                      >
                        {persona.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit">Create Serving</Button>
        </div>
      </form>
    </Form>
  );
}
