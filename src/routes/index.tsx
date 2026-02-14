import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Flame, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { isConvexConfigured } from "@/integrations/convex/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { SearchablePicker } from "@/components/ui/searchable-picker";
import { Toggle } from "@/components/ui/toggle";

const EMPTY_MANAGEMENT_DATA = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
};

type DraftMealItem = {
  sourceType: "ingredient" | "cookedFood";
  ingredientId?: Id<"ingredients">;
  cookedFoodId?: Id<"cookedFoods">;
  consumedWeightGrams: number;
};

export const Route = createFileRoute("/")({
  ssr: false,
  component: MealDashboardPage,
});

function MealDashboardPage() {
  if (!isConvexConfigured) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_20%,#f9f4df_0%,#f6f6f4_50%,#eff5f1_100%)] px-4 py-10 sm:px-6 dark:bg-[radial-gradient(circle_at_20%_20%,#1b2230_0%,#101721_48%,#0a1018_100%)]">
        <Card className="mx-auto max-w-3xl border-amber-200 bg-card/90 dark:border-amber-500/30">
          <CardHeader>
            <CardTitle>Connect Convex First</CardTitle>
            <CardDescription>
              Add `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT` in
              `/Users/hu901191/calorie-counter/.env.local`, then reload.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return <MealDashboardPageContent />;
}

function MealDashboardPageContent() {
  const [showArchivedMeals, setShowArchivedMeals] = useState(false);

  const [selectedPersonId, setSelectedPersonId] = useState<Id<"people"> | "">(
    "",
  );
  const [mealDate, setMealDate] = useState(() => toLocalDateString(Date.now()));
  const [mealName, setMealName] = useState("");
  const [mealNotes, setMealNotes] = useState("");
  const [editingMealId, setEditingMealId] = useState<Id<"meals"> | null>(null);

  const [itemSourceType, setItemSourceType] = useState<
    "ingredient" | "cookedFood"
  >("ingredient");
  const [itemIngredientId, setItemIngredientId] = useState<
    Id<"ingredients"> | ""
  >("");
  const [itemCookedFoodId, setItemCookedFoodId] = useState<
    Id<"cookedFoods"> | ""
  >("");
  const [itemWeight, setItemWeight] = useState("");
  const [editingDraftItemIndex, setEditingDraftItemIndex] = useState<
    number | null
  >(null);
  const [mealItems, setMealItems] = useState<DraftMealItem[]>([]);

  const dataResult = useQuery(api.nutrition.getManagementData);
  const data = (dataResult ?? EMPTY_MANAGEMENT_DATA) as NonNullable<
    typeof dataResult
  >;
  const isLoading = dataResult === undefined;

  const createMeal = useMutation(api.nutrition.createMeal);
  const updateMeal = useMutation(api.nutrition.updateMeal);
  const setMealArchived = useMutation(api.nutrition.setMealArchived);
  const deleteMeal = useMutation(api.nutrition.deleteMeal);

  const people = useMemo(
    () => data.people.filter((person) => person.active),
    [data.people],
  );
  const effectiveSelectedPersonId = useMemo<Id<"people"> | "">(() => {
    if (people.length === 0) {
      return "";
    }
    const hasSelectedPerson = people.some(
      (person) => person._id === selectedPersonId,
    );
    if (hasSelectedPerson) {
      return selectedPersonId;
    }
    return people[0]._id;
  }, [people, selectedPersonId]);
  const ingredients = useMemo(
    () => data.ingredients.filter((item) => !item.archived),
    [data.ingredients],
  );
  const cookedFoods = useMemo(
    () => data.cookedFoods.filter((item) => !item.archived),
    [data.cookedFoods],
  );
  const ingredientById = useMemo(
    () => new Map(ingredients.map((item) => [item._id, item])),
    [ingredients],
  );
  const cookedFoodById = useMemo(
    () => new Map(cookedFoods.map((item) => [item._id, item])),
    [cookedFoods],
  );
  const mealItemsByMealId = useMemo(() => {
    const map = new Map<Id<"meals">, Doc<"mealItems">[]>();
    for (const item of data.mealItems) {
      const existing = map.get(item.mealId);
      if (existing) {
        existing.push(item);
      } else {
        map.set(item.mealId, [item]);
      }
    }
    return map;
  }, [data.mealItems]);

  const selectedPerson = people.find(
    (person) => person._id === effectiveSelectedPersonId,
  );

  const mealsForSelection = data.meals.filter((meal) => {
    if (
      effectiveSelectedPersonId &&
      meal.personId !== effectiveSelectedPersonId
    ) {
      return false;
    }
    if (getMealDateKey(meal) !== mealDate) {
      return false;
    }
    if (!showArchivedMeals && meal.archived) {
      return false;
    }
    return true;
  });

  const consumedToday = mealsForSelection
    .filter((meal) => !meal.archived)
    .reduce((sum, meal) => {
      const itemRows = mealItemsByMealId.get(meal._id) ?? [];
      return (
        sum +
        itemRows.reduce((innerSum, row) => innerSum + row.caloriesSnapshot, 0)
      );
    }, 0);

  const draftCalories = mealItems.reduce((sum, item) => {
    if (item.sourceType === "ingredient" && item.ingredientId) {
      const ingredient = ingredientById.get(item.ingredientId);
      if (!ingredient) {
        return sum;
      }
      return sum + (item.consumedWeightGrams * ingredient.kcalPer100g) / 100;
    }
    if (item.sourceType === "cookedFood" && item.cookedFoodId) {
      const cookedFood = cookedFoodById.get(item.cookedFoodId);
      if (!cookedFood) {
        return sum;
      }
      return sum + (item.consumedWeightGrams * cookedFood.kcalPer100g) / 100;
    }
    return sum;
  }, 0);

  const remainingToday = selectedPerson
    ? selectedPerson.currentDailyGoalKcal - consumedToday
    : 0;
  const remainingAfterDraft = remainingToday - draftCalories;

  async function runAction(
    successText: string,
    action: () => Promise<unknown>,
  ) {
    try {
      await action();
      toast.success(successText);
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  }

  const resetDraftItemInputs = () => {
    setItemSourceType("ingredient");
    setItemIngredientId("");
    setItemCookedFoodId("");
    setItemWeight("");
    setEditingDraftItemIndex(null);
  };

  const upsertDraftItem = () => {
    const parsedWeight = Number(itemWeight);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      return;
    }

    if (itemSourceType === "ingredient") {
      if (!itemIngredientId) {
        return;
      }
      if (editingDraftItemIndex !== null) {
        setMealItems((current) =>
          current.map((item, index) =>
            index === editingDraftItemIndex
              ? {
                  sourceType: "ingredient",
                  ingredientId: itemIngredientId,
                  consumedWeightGrams: parsedWeight,
                }
              : item,
          ),
        );
      } else {
        setMealItems((current) => [
          ...current,
          {
            sourceType: "ingredient",
            ingredientId: itemIngredientId,
            consumedWeightGrams: parsedWeight,
          },
        ]);
      }
      resetDraftItemInputs();
      return;
    }

    if (!itemCookedFoodId) {
      return;
    }
    if (editingDraftItemIndex !== null) {
      setMealItems((current) =>
        current.map((item, index) =>
          index === editingDraftItemIndex
            ? {
                sourceType: "cookedFood",
                cookedFoodId: itemCookedFoodId,
                consumedWeightGrams: parsedWeight,
              }
            : item,
        ),
      );
    } else {
      setMealItems((current) => [
        ...current,
        {
          sourceType: "cookedFood",
          cookedFoodId: itemCookedFoodId,
          consumedWeightGrams: parsedWeight,
        },
      ]);
    }
    resetDraftItemInputs();
  };

  const editDraftItem = (index: number) => {
    const item = mealItems[index];
    if (!item) {
      return;
    }
    setEditingDraftItemIndex(index);
    setItemSourceType(item.sourceType);
    if (item.sourceType === "ingredient") {
      setItemIngredientId(item.ingredientId ?? "");
      setItemCookedFoodId("");
    } else {
      setItemCookedFoodId(item.cookedFoodId ?? "");
      setItemIngredientId("");
    }
    setItemWeight(item.consumedWeightGrams.toString());
  };

  const removeDraftItem = (index: number) => {
    setMealItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );

    if (editingDraftItemIndex === null) {
      return;
    }
    if (editingDraftItemIndex === index) {
      resetDraftItemInputs();
      return;
    }
    if (editingDraftItemIndex > index) {
      setEditingDraftItemIndex(editingDraftItemIndex - 1);
    }
  };

  const resetMealForm = () => {
    setMealName("");
    setMealNotes("");
    setEditingMealId(null);
    setMealItems([]);
    resetDraftItemInputs();
  };

  const editMeal = (mealId: Id<"meals">) => {
    const meal = data.meals.find((item) => item._id === mealId);
    if (!meal) {
      return;
    }
    const itemRows = mealItemsByMealId.get(mealId) ?? [];
    setSelectedPersonId(meal.personId);
    setMealDate(getMealDateKey(meal));
    setMealName(meal.name ?? "");
    setMealNotes(meal.notes ?? "");
    setEditingMealId(meal._id);
    setMealItems(
      itemRows.map((row) => ({
        sourceType: row.sourceType,
        ingredientId: row.ingredientId,
        cookedFoodId: row.cookedFoodId,
        consumedWeightGrams: row.consumedWeightGrams,
      })),
    );
  };

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_20%,#f9f4df_0%,#f6f6f4_50%,#eff5f1_100%)] px-4 py-10 sm:px-6 dark:bg-[radial-gradient(circle_at_20%_20%,#1b2230_0%,#101721_48%,#0a1018_100%)]">
        <Card className="mx-auto max-w-3xl border-border bg-card/90">
          <CardHeader>
            <CardTitle>Loading Meal Dashboard</CardTitle>
            <CardDescription>
              Reading today’s nutrition state from Convex.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_15%_10%,#fff6de_0%,#f7f6f3_45%,#e9f1eb_100%)] dark:bg-[radial-gradient(circle_at_15%_10%,#1d2535_0%,#111a26_45%,#0a1119_100%)]">
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-700">
            <Flame className="h-4 w-4" />
            Meal Logging
          </p>
          <h1 data-display="true" className="mt-2 text-4xl text-foreground">
            Daily calories with quick correction flow
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a person and day, log servings, then edit/archive/delete
            mistakes directly.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="border-emerald-200/80 bg-card/90 dark:border-emerald-500/30">
            <CardHeader>
              <CardDescription>Target</CardDescription>
              <CardTitle>
                {selectedPerson?.currentDailyGoalKcal.toFixed(0) ?? "--"} kcal
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardDescription>Consumed Today</CardDescription>
              <CardTitle>{consumedToday.toFixed(0)} kcal</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-amber-200/80 bg-card/90 dark:border-amber-500/30">
            <CardHeader>
              <CardDescription>Remaining After Draft</CardDescription>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-700" />
                {remainingAfterDraft.toFixed(0)} kcal
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle>
                {editingMealId ? "Edit Meal" : "Create Meal"}
              </CardTitle>
              <CardDescription>
                Remaining today:{" "}
                {selectedPerson ? `${remainingToday.toFixed(0)} kcal` : "--"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Person
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {people.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Add an active person in Manage before creating meals.
                      </p>
                    ) : (
                      people.map((person) => (
                        <Toggle
                          key={person._id}
                          variant="outline"
                          size="lg"
                          pressed={effectiveSelectedPersonId === person._id}
                          onPressedChange={(pressed) => {
                            if (pressed) {
                              setSelectedPersonId(person._id);
                            }
                          }}
                          className="h-9 rounded-full px-3 text-sm data-[state=on]:border-emerald-500/55 data-[state=on]:bg-emerald-500/15 data-[state=on]:text-foreground"
                        >
                          {person.name}
                        </Toggle>
                      ))
                    )}
                  </div>
                </div>
                <DatePicker value={mealDate} onChange={setMealDate} />
              </div>

              <Input
                placeholder="Meal name (optional)"
                value={mealName}
                onChange={(event) => setMealName(event.target.value)}
              />
              <Input
                placeholder="Meal notes"
                value={mealNotes}
                onChange={(event) => setMealNotes(event.target.value)}
              />

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">Meal item</p>
                <div className="mt-2">
                  <div className="inline-flex rounded-xl border border-border/80 bg-muted/35 p-1">
                    <Toggle
                      variant="default"
                      size="lg"
                      pressed={itemSourceType === "ingredient"}
                      onPressedChange={(pressed) => {
                        if (!pressed) {
                          return;
                        }
                        setItemSourceType("ingredient");
                        setItemIngredientId("");
                        setItemCookedFoodId("");
                      }}
                      className="h-8 rounded-lg px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-xs"
                    >
                      Ingredient
                    </Toggle>
                    <Toggle
                      variant="default"
                      size="lg"
                      pressed={itemSourceType === "cookedFood"}
                      onPressedChange={(pressed) => {
                        if (!pressed) {
                          return;
                        }
                        setItemSourceType("cookedFood");
                        setItemIngredientId("");
                        setItemCookedFoodId("");
                      }}
                      className="h-8 rounded-lg px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-xs"
                    >
                      Cooked food
                    </Toggle>
                  </div>
                </div>
                <div className="mt-3 grid items-start gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto]">
                  {itemSourceType === "ingredient" ? (
                    <SearchablePicker
                      value={itemIngredientId}
                      onValueChange={(value) =>
                        setItemIngredientId(value as Id<"ingredients"> | "")
                      }
                      placeholder="Search ingredients"
                      options={ingredients.map((item) => ({
                        value: item._id,
                        label: item.name,
                        keywords: `${item.brand ?? ""} ${item.kcalPer100g.toFixed(1)} kcal`,
                      }))}
                    />
                  ) : (
                    <SearchablePicker
                      value={itemCookedFoodId}
                      onValueChange={(value) =>
                        setItemCookedFoodId(value as Id<"cookedFoods"> | "")
                      }
                      placeholder="Search cooked foods"
                      options={cookedFoods.map((item) => ({
                        value: item._id,
                        label: item.name,
                        keywords: `${item.kcalPer100g.toFixed(1)} kcal`,
                      }))}
                    />
                  )}
                  <Input
                    type="number"
                    placeholder="grams"
                    value={itemWeight}
                    onChange={(event) => setItemWeight(event.target.value)}
                    className="min-w-28"
                  />
                  <Button variant="outline" onClick={upsertDraftItem}>
                    <Plus className="h-4 w-4" />
                    {editingDraftItemIndex === null ? "Add" : "Update"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2 rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
                  {editingDraftItemIndex !== null ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-400/35 bg-emerald-500/8 px-2 py-1 text-foreground dark:border-emerald-400/25 dark:bg-emerald-400/10">
                      <p className="text-xs font-medium">
                        Editing item #{editingDraftItemIndex + 1}
                      </p>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={resetDraftItemInputs}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                  {mealItems.length === 0 ? (
                    <p className="px-1 py-0.5 text-xs text-muted-foreground">
                      No draft items yet.
                    </p>
                  ) : null}
                  {mealItems.map((item, index) => {
                    const label =
                      item.sourceType === "ingredient"
                        ? ingredientById.get(
                            item.ingredientId as Id<"ingredients">,
                          )?.name
                        : cookedFoodById.get(
                            item.cookedFoodId as Id<"cookedFoods">,
                          )?.name;
                    return (
                      <div
                        key={`draft-item-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/65 bg-background/45 px-2 py-1.5"
                      >
                        <p className="min-w-0 pr-2 text-xs text-foreground">
                          <span className="font-medium">
                            {item.sourceType === "ingredient"
                              ? "Ingredient"
                              : "Cooked food"}
                          </span>
                          : {label ?? "Unknown"} -{" "}
                          {item.consumedWeightGrams.toFixed(1)}g
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => editDraftItem(index)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => removeDraftItem(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    if (!effectiveSelectedPersonId || mealItems.length === 0) {
                      return;
                    }
                    void runAction(
                      editingMealId ? "Meal updated." : "Meal created.",
                      async () => {
                        if (editingMealId) {
                          await updateMeal({
                            mealId: editingMealId,
                            personId: effectiveSelectedPersonId,
                            name: mealName.trim() || undefined,
                            eatenOn: mealDate,
                            notes: mealNotes.trim() || undefined,
                            items: mealItems,
                          });
                        } else {
                          await createMeal({
                            personId: effectiveSelectedPersonId,
                            name: mealName.trim() || undefined,
                            eatenOn: mealDate,
                            notes: mealNotes.trim() || undefined,
                            items: mealItems,
                          });
                        }
                        resetMealForm();
                      },
                    );
                  }}
                >
                  {editingMealId ? "Save meal changes" : "Create meal"}
                </Button>
                {editingMealId ? (
                  <Button variant="outline" onClick={resetMealForm}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle>Meals for {mealDate}</CardTitle>
              <CardDescription className="flex items-center justify-between gap-2">
                <span>{selectedPerson?.name ?? "All people"}</span>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showArchivedMeals}
                    onChange={(event) =>
                      setShowArchivedMeals(event.target.checked)
                    }
                  />
                  Show archived
                </label>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mealsForSelection.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No meals for this selection.
                </p>
              ) : null}
              {mealsForSelection.map((meal) => {
                const itemRows = mealItemsByMealId.get(meal._id) ?? [];
                const totalCalories = itemRows.reduce(
                  (sum, row) => sum + row.caloriesSnapshot,
                  0,
                );
                return (
                  <div
                    key={meal._id}
                    className="rounded-lg border border-border bg-muted/45 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {meal.name ?? "Meal"} - {totalCalories.toFixed(0)} kcal
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => editMeal(meal._id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void runAction(
                              meal.archived
                                ? "Meal restored."
                                : "Meal archived.",
                              async () => {
                                await setMealArchived({
                                  mealId: meal._id,
                                  archived: !meal.archived,
                                });
                              },
                            )
                          }
                        >
                          {meal.archived ? "Unarchive" : "Archive"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            void runAction("Meal deleted.", async () => {
                              await deleteMeal({ mealId: meal._id });
                              if (editingMealId === meal._id) {
                                resetMealForm();
                              }
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {itemRows.map((row) => (
                        <p key={row._id}>
                          {row.sourceType === "ingredient"
                            ? ingredientById.get(
                                row.ingredientId as Id<"ingredients">,
                              )?.name
                            : cookedFoodById.get(
                                row.cookedFoodId as Id<"cookedFoods">,
                              )?.name}
                          {" - "}
                          {row.consumedWeightGrams.toFixed(1)}g (
                          {row.caloriesSnapshot.toFixed(0)} kcal)
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMealDateKey(meal: {
  eatenOn?: string;
  eatenAt?: number;
  createdAt: number;
}) {
  if (meal.eatenOn) {
    return meal.eatenOn;
  }
  if (meal.eatenAt) {
    return toLocalDateString(meal.eatenAt);
  }
  return toLocalDateString(meal.createdAt);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
}
