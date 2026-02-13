import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@base-ui/react/switch";
import { useMemo, useState, type ComponentType } from "react";
import {
  BookOpenText,
  ChefHat,
  Flame,
  Salad,
  Target,
  UserRound,
  Wheat,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isConvexConfigured } from "@/integrations/convex/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type GroupScope = "ingredient" | "cookedFood" | "both";
type UnitType = "g" | "ml" | "piece";
type MealSourceType = "ingredient" | "cookedFood";

type RecipeIngredientDraft = {
  ingredientId: Id<"ingredients">;
  plannedWeightGrams: number;
  notes?: string;
};

type RecipeOutputDraft = {
  name: string;
  groupIds: Id<"foodGroups">[];
  plannedFinishedWeightGrams?: number;
};

type CookedFoodIngredientDraft = {
  ingredientId: Id<"ingredients">;
  rawWeightGrams: number;
};

type MealItemDraft = {
  sourceType: MealSourceType;
  ingredientId?: Id<"ingredients">;
  cookedFoodId?: Id<"cookedFoods">;
  consumedWeightGrams: number;
  notes?: string;
};

const EMPTY_MANAGEMENT_DATA = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  recipeVersionOutputs: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
};

export const Route = createFileRoute("/")({
  ssr: false,
  component: NutritionStudio,
});

function NutritionStudio() {
  if (!isConvexConfigured) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_20%,#f9f4df_0%,#f6f6f4_50%,#eff5f1_100%)] px-4 py-10 dark:bg-[radial-gradient(circle_at_20%_20%,#1f2937_0%,#111827_55%,#0b1220_100%)] sm:px-6">
        <Card className="mx-auto max-w-3xl border-amber-200 bg-card/95">
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

  return <ConfiguredNutritionStudio />;
}

function ConfiguredNutritionStudio() {
  const [showArchived, setShowArchived] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [personName, setPersonName] = useState("");
  const [personGoal, setPersonGoal] = useState("2200");
  const [personNotes, setPersonNotes] = useState("");
  const [goalPersonId, setGoalPersonId] = useState<Id<"people"> | "">("");
  const [goalKcal, setGoalKcal] = useState("2300");
  const [goalReason, setGoalReason] = useState("");

  const [groupName, setGroupName] = useState("");
  const [groupScope, setGroupScope] = useState<GroupScope>("both");

  const [ingredientName, setIngredientName] = useState("");
  const [ingredientBrand, setIngredientBrand] = useState("");
  const [ingredientKcal, setIngredientKcal] = useState("");
  const [ingredientUnit, setIngredientUnit] = useState<UnitType>("g");
  const [ingredientGramsPerUnit, setIngredientGramsPerUnit] = useState("");
  const [ingredientGroupId, setIngredientGroupId] = useState<
    Id<"foodGroups"> | ""
  >("");
  const [ingredientNotes, setIngredientNotes] = useState("");

  const [recipeName, setRecipeName] = useState("");
  const [recipeDescription, setRecipeDescription] = useState("");
  const [recipeInstructions, setRecipeInstructions] = useState("");
  const [recipeNotes, setRecipeNotes] = useState("");
  const [recipeLineIngredientId, setRecipeLineIngredientId] = useState<
    Id<"ingredients"> | ""
  >("");
  const [recipeLineWeight, setRecipeLineWeight] = useState("");
  const [recipeLineNotes, setRecipeLineNotes] = useState("");
  const [recipeIngredientLines, setRecipeIngredientLines] = useState<
    RecipeIngredientDraft[]
  >([]);
  const [recipeOutputName, setRecipeOutputName] = useState("");
  const [recipeOutputGroupId, setRecipeOutputGroupId] = useState<
    Id<"foodGroups"> | ""
  >("");
  const [recipeOutputWeight, setRecipeOutputWeight] = useState("");
  const [recipeOutputLines, setRecipeOutputLines] = useState<
    RecipeOutputDraft[]
  >([]);

  const [versionRecipeId, setVersionRecipeId] = useState<Id<"recipes"> | "">(
    "",
  );
  const [versionNotes, setVersionNotes] = useState("");

  const [sessionLabel, setSessionLabel] = useState("");
  const [sessionPersonId, setSessionPersonId] = useState<Id<"people"> | "">("");
  const [sessionNotes, setSessionNotes] = useState("");

  const [cookedFoodSessionId, setCookedFoodSessionId] = useState<
    Id<"cookSessions"> | ""
  >("");
  const [cookedFoodName, setCookedFoodName] = useState("");
  const [cookedFoodGroupId, setCookedFoodGroupId] = useState<
    Id<"foodGroups"> | ""
  >("");
  const [cookedFoodFinishedWeight, setCookedFoodFinishedWeight] = useState("");
  const [cookedFoodRecipeVersionId, setCookedFoodRecipeVersionId] = useState<
    Id<"recipeVersions"> | ""
  >("");
  const [cookedFoodIngredientId, setCookedFoodIngredientId] = useState<
    Id<"ingredients"> | ""
  >("");
  const [cookedFoodIngredientWeight, setCookedFoodIngredientWeight] =
    useState("");
  const [cookedFoodNotes, setCookedFoodNotes] = useState("");
  const [cookedFoodIngredients, setCookedFoodIngredients] = useState<
    CookedFoodIngredientDraft[]
  >([]);

  const [mealPersonId, setMealPersonId] = useState<Id<"people"> | "">("");
  const [mealName, setMealName] = useState("");
  const [mealEatenAt, setMealEatenAt] = useState(() =>
    toDateTimeLocalValue(Date.now()),
  );
  const [mealNotes, setMealNotes] = useState("");
  const [mealItemSourceType, setMealItemSourceType] =
    useState<MealSourceType>("ingredient");
  const [mealIngredientId, setMealIngredientId] = useState<
    Id<"ingredients"> | ""
  >("");
  const [mealCookedFoodId, setMealCookedFoodId] = useState<
    Id<"cookedFoods"> | ""
  >("");
  const [mealItemWeight, setMealItemWeight] = useState("");
  const [mealItems, setMealItems] = useState<MealItemDraft[]>([]);

  const createPerson = useMutation(api.nutrition.createPerson);
  const updatePersonGoal = useMutation(api.nutrition.updatePersonGoal);
  const createFoodGroup = useMutation(api.nutrition.createFoodGroup);
  const createIngredient = useMutation(api.nutrition.createIngredient);
  const createRecipe = useMutation(api.nutrition.createRecipe);
  const addRecipeVersion = useMutation(api.nutrition.addRecipeVersion);
  const createCookSession = useMutation(api.nutrition.createCookSession);
  const createCookedFood = useMutation(api.nutrition.createCookedFood);
  const createMeal = useMutation(api.nutrition.createMeal);

  const dataResult = useQuery(api.nutrition.getManagementData);
  const isLoading = dataResult === undefined;
  const data = (dataResult ?? EMPTY_MANAGEMENT_DATA) as NonNullable<
    typeof dataResult
  >;

  const visibleGroups = showArchived
    ? data.foodGroups
    : data.foodGroups.filter((group) => !group.archived);
  const visibleIngredients = showArchived
    ? data.ingredients
    : data.ingredients.filter((ingredient) => !ingredient.archived);
  const visibleRecipes = showArchived
    ? data.recipes
    : data.recipes.filter((recipe) => !recipe.archived);
  const visiblePeople = data.people.filter((person) => person.active);

  const ingredientById = useMemo(
    () =>
      new Map(
        data.ingredients.map((ingredient) => [ingredient._id, ingredient]),
      ),
    [data.ingredients],
  );
  const groupById = useMemo(
    () => new Map(data.foodGroups.map((group) => [group._id, group])),
    [data.foodGroups],
  );
  const currentVersionByRecipeId = useMemo(() => {
    const map = new Map<Id<"recipes">, (typeof data.recipeVersions)[number]>();
    for (const version of data.recipeVersions) {
      if (version.isCurrent && !map.has(version.recipeId)) {
        map.set(version.recipeId, version);
      }
    }
    return map;
  }, [data.recipeVersions]);
  const versionById = useMemo(
    () => new Map(data.recipeVersions.map((version) => [version._id, version])),
    [data.recipeVersions],
  );
  const versionIngredientsByVersionId = useMemo(() => {
    const map = new Map<
      Id<"recipeVersions">,
      typeof data.recipeVersionIngredients
    >();
    for (const line of data.recipeVersionIngredients) {
      const bucket = map.get(line.recipeVersionId);
      if (bucket) {
        bucket.push(line);
      } else {
        map.set(line.recipeVersionId, [line]);
      }
    }
    return map;
  }, [data.recipeVersionIngredients]);
  const versionOutputsByVersionId = useMemo(() => {
    const map = new Map<
      Id<"recipeVersions">,
      typeof data.recipeVersionOutputs
    >();
    for (const line of data.recipeVersionOutputs) {
      const bucket = map.get(line.recipeVersionId);
      if (bucket) {
        bucket.push(line);
      } else {
        map.set(line.recipeVersionId, [line]);
      }
    }
    return map;
  }, [data.recipeVersionOutputs]);
  const mealItemsByMealId = useMemo(() => {
    const map = new Map<Id<"meals">, typeof data.mealItems>();
    for (const item of data.mealItems) {
      const bucket = map.get(item.mealId);
      if (bucket) {
        bucket.push(item);
      } else {
        map.set(item.mealId, [item]);
      }
    }
    return map;
  }, [data.mealItems]);
  const peopleById = useMemo(
    () => new Map(data.people.map((person) => [person._id, person])),
    [data.people],
  );
  const cookSessionById = useMemo(
    () => new Map(data.cookSessions.map((session) => [session._id, session])),
    [data.cookSessions],
  );

  async function runAction(
    successText: string,
    action: () => Promise<unknown>,
  ) {
    try {
      await action();
      setStatusMessage(successText);
      setErrorMessage(null);
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(toErrorMessage(error));
    }
  }

  const addRecipeIngredientLine = () => {
    if (!recipeLineIngredientId) {
      return;
    }
    const weight = Number(recipeLineWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return;
    }
    setRecipeIngredientLines((current) => [
      ...current,
      {
        ingredientId: recipeLineIngredientId,
        plannedWeightGrams: weight,
        notes: recipeLineNotes.trim() || undefined,
      },
    ]);
    setRecipeLineIngredientId("");
    setRecipeLineWeight("");
    setRecipeLineNotes("");
  };

  const addRecipeOutputLine = () => {
    if (!recipeOutputName.trim()) {
      return;
    }
    const weight = Number(recipeOutputWeight);
    setRecipeOutputLines((current) => [
      ...current,
      {
        name: recipeOutputName.trim(),
        groupIds: recipeOutputGroupId ? [recipeOutputGroupId] : [],
        plannedFinishedWeightGrams:
          Number.isFinite(weight) && weight > 0 ? weight : undefined,
      },
    ]);
    setRecipeOutputName("");
    setRecipeOutputGroupId("");
    setRecipeOutputWeight("");
  };

  const addCookedFoodIngredientLine = () => {
    if (!cookedFoodIngredientId) {
      return;
    }
    const weight = Number(cookedFoodIngredientWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return;
    }
    setCookedFoodIngredients((current) => [
      ...current,
      {
        ingredientId: cookedFoodIngredientId,
        rawWeightGrams: weight,
      },
    ]);
    setCookedFoodIngredientId("");
    setCookedFoodIngredientWeight("");
  };

  const addMealItem = () => {
    const weight = Number(mealItemWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return;
    }

    if (mealItemSourceType === "ingredient") {
      if (!mealIngredientId) {
        return;
      }
      setMealItems((current) => [
        ...current,
        {
          sourceType: "ingredient",
          ingredientId: mealIngredientId,
          consumedWeightGrams: weight,
        },
      ]);
      setMealIngredientId("");
      setMealItemWeight("");
      return;
    }

    if (!mealCookedFoodId) {
      return;
    }
    setMealItems((current) => [
      ...current,
      {
        sourceType: "cookedFood",
        cookedFoodId: mealCookedFoodId,
        consumedWeightGrams: weight,
      },
    ]);
    setMealCookedFoodId("");
    setMealItemWeight("");
  };

  const prefillCookedFoodFromRecipeVersion = () => {
    if (!cookedFoodRecipeVersionId) {
      return;
    }
    const version = versionById.get(cookedFoodRecipeVersionId);
    const plannedLines = versionIngredientsByVersionId.get(
      cookedFoodRecipeVersionId,
    );
    if (!version || !plannedLines) {
      return;
    }

    setCookedFoodName(version.name);
    setCookedFoodIngredients(
      plannedLines.map((line) => ({
        ingredientId: line.ingredientId,
        rawWeightGrams: line.plannedWeightGrams,
      })),
    );
  };

  const createNextRecipeVersionFromCurrent = () => {
    if (!versionRecipeId) {
      return;
    }
    const recipe = data.recipes.find((item) => item._id === versionRecipeId);
    const currentVersion = currentVersionByRecipeId.get(versionRecipeId);
    if (!recipe || !currentVersion) {
      return;
    }
    const plannedIngredients =
      versionIngredientsByVersionId.get(currentVersion._id) ?? [];
    const plannedOutputs =
      versionOutputsByVersionId.get(currentVersion._id) ?? [];
    if (plannedIngredients.length === 0) {
      return;
    }

    void runAction("Created next recipe version.", async () => {
      await addRecipeVersion({
        recipeId: recipe._id,
        name: currentVersion.name,
        instructions: currentVersion.instructions,
        notes: versionNotes.trim() || currentVersion.notes,
        plannedIngredients: plannedIngredients.map((line) => ({
          ingredientId: line.ingredientId,
          plannedWeightGrams: line.plannedWeightGrams,
          notes: line.notes,
        })),
        plannedOutputs: plannedOutputs.map((line) => ({
          name: line.name,
          groupIds: line.groupIds,
          plannedFinishedWeightGrams: line.plannedFinishedWeightGrams,
        })),
      });
      setVersionRecipeId("");
      setVersionNotes("");
    });
  };

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_20%,#f9f4df_0%,#f6f6f4_50%,#eff5f1_100%)] px-4 py-10 dark:bg-[radial-gradient(circle_at_20%_20%,#1f2937_0%,#111827_55%,#0b1220_100%)] sm:px-6">
        <Card className="mx-auto max-w-3xl border-border bg-card/95">
          <CardHeader>
            <CardTitle>Loading Nutrition Studio</CardTitle>
            <CardDescription>
              Fetching people, foods, recipes, and logs.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_15%_10%,#fff6de_0%,#f7f6f3_45%,#e9f1eb_100%)] pb-12 dark:bg-[radial-gradient(circle_at_15%_10%,#1b2435_0%,#121a29_50%,#0a101b_100%)]">
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-200/80 bg-card/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-700">
                <Flame className="h-4 w-4" />
                Nutrition Studio
              </p>
              <h1 data-display="true" className="mt-2 text-4xl text-foreground">
                Schema + management UI in one place
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Manage people, goals, ingredients, recipe versions, cooked food
                outputs, and logged meals with snapshot nutrition values.
              </p>
            </div>

            <label className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/90">
              Show archived
              <Switch.Root
                checked={showArchived}
                onCheckedChange={setShowArchived}
                className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted p-1 transition-colors data-checked:bg-emerald-500"
              >
                <Switch.Thumb className="size-4 rounded-full bg-background transition-transform data-checked:translate-x-5" />
              </Switch.Root>
            </label>
          </div>

          {statusMessage ? (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {statusMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryBadge
              icon={UserRound}
              label="People"
              value={String(visiblePeople.length)}
            />
            <SummaryBadge
              icon={Wheat}
              label="Ingredients"
              value={String(visibleIngredients.length)}
            />
            <SummaryBadge
              icon={BookOpenText}
              label="Recipes"
              value={String(visibleRecipes.length)}
            />
            <SummaryBadge
              icon={Salad}
              label="Cooked foods"
              value={String(data.cookedFoods.length)}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card className="border-border/80 bg-card/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <UserRound className="h-4 w-4 text-emerald-700" />
                People and Goal History
              </CardTitle>
              <CardDescription>
                People carry current daily kcal targets plus effective-dated
                goal history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Person name"
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Daily goal kcal"
                  value={personGoal}
                  onChange={(event) => setPersonGoal(event.target.value)}
                />
              </div>
              <Textarea
                placeholder="Notes (optional)"
                value={personNotes}
                onChange={(event) => setPersonNotes(event.target.value)}
              />
              <Button
                onClick={() =>
                  void runAction("Person added.", async () => {
                    await createPerson({
                      name: personName,
                      currentDailyGoalKcal: Number(personGoal),
                      notes: personNotes.trim() || undefined,
                    });
                    setPersonName("");
                    setPersonGoal("2200");
                    setPersonNotes("");
                  })
                }
              >
                Add person
              </Button>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Update goal
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={goalPersonId}
                    onChange={(event) =>
                      setGoalPersonId(event.target.value as Id<"people"> | "")
                    }
                  >
                    <option value="">Select person</option>
                    {visiblePeople.map((person) => (
                      <option key={person._id} value={person._id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="New kcal goal"
                    value={goalKcal}
                    onChange={(event) => setGoalKcal(event.target.value)}
                  />
                </div>
                <Input
                  className="mt-3"
                  placeholder="Reason"
                  value={goalReason}
                  onChange={(event) => setGoalReason(event.target.value)}
                />
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => {
                    if (!goalPersonId) {
                      return;
                    }
                    void runAction("Goal updated.", async () => {
                      await updatePersonGoal({
                        personId: goalPersonId,
                        goalKcal: Number(goalKcal),
                        reason: goalReason.trim() || undefined,
                      });
                      setGoalPersonId("");
                      setGoalKcal("2300");
                      setGoalReason("");
                    });
                  }}
                >
                  Save goal update
                </Button>
              </div>

              <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border p-3">
                {visiblePeople.map((person) => (
                  <div
                    key={person._id}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span>{person.name}</span>
                    <span className="font-medium text-foreground/90">
                      {person.currentDailyGoalKcal.toFixed(0)} kcal/day
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Wheat className="h-4 w-4 text-amber-700" />
                Groups and Ingredients
              </CardTitle>
              <CardDescription>
                Ingredients can be grouped (meat, side, salad) and used in
                recipes or direct meal items.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Create group
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <Input
                    placeholder="Group name"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={groupScope}
                    onChange={(event) =>
                      setGroupScope(event.target.value as GroupScope)
                    }
                  >
                    <option value="both">Both</option>
                    <option value="ingredient">Ingredient</option>
                    <option value="cookedFood">Cooked food</option>
                  </select>
                  <Button
                    onClick={() =>
                      void runAction("Food group added.", async () => {
                        await createFoodGroup({
                          name: groupName,
                          appliesTo: groupScope,
                        });
                        setGroupName("");
                        setGroupScope("both");
                      })
                    }
                  >
                    Add group
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Create ingredient
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Ingredient name"
                    value={ingredientName}
                    onChange={(event) => setIngredientName(event.target.value)}
                  />
                  <Input
                    placeholder="Brand (optional)"
                    value={ingredientBrand}
                    onChange={(event) => setIngredientBrand(event.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="kcal / 100g"
                    value={ingredientKcal}
                    onChange={(event) => setIngredientKcal(event.target.value)}
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={ingredientUnit}
                    onChange={(event) =>
                      setIngredientUnit(event.target.value as UnitType)
                    }
                  >
                    <option value="g">Grams</option>
                    <option value="ml">Milliliters</option>
                    <option value="piece">Piece</option>
                  </select>
                  <Input
                    type="number"
                    placeholder="grams per unit (optional)"
                    value={ingredientGramsPerUnit}
                    onChange={(event) =>
                      setIngredientGramsPerUnit(event.target.value)
                    }
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={ingredientGroupId}
                    onChange={(event) =>
                      setIngredientGroupId(
                        event.target.value as Id<"foodGroups"> | "",
                      )
                    }
                  >
                    <option value="">No group</option>
                    {visibleGroups.map((group) => (
                      <option key={group._id} value={group._id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Textarea
                  className="mt-3"
                  placeholder="Ingredient notes"
                  value={ingredientNotes}
                  onChange={(event) => setIngredientNotes(event.target.value)}
                />
                <Button
                  className="mt-3"
                  onClick={() =>
                    void runAction("Ingredient added.", async () => {
                      await createIngredient({
                        name: ingredientName,
                        brand: ingredientBrand.trim() || undefined,
                        kcalPer100g: Number(ingredientKcal),
                        defaultUnit: ingredientUnit,
                        gramsPerUnit:
                          ingredientGramsPerUnit.trim() === ""
                            ? undefined
                            : Number(ingredientGramsPerUnit),
                        groupIds: ingredientGroupId ? [ingredientGroupId] : [],
                        notes: ingredientNotes.trim() || undefined,
                      });
                      setIngredientName("");
                      setIngredientBrand("");
                      setIngredientKcal("");
                      setIngredientUnit("g");
                      setIngredientGramsPerUnit("");
                      setIngredientGroupId("");
                      setIngredientNotes("");
                    })
                  }
                >
                  Add ingredient
                </Button>
              </div>

              <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border p-3">
                {visibleIngredients.map((ingredient) => (
                  <div
                    key={ingredient._id}
                    className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {ingredient.name}
                      </span>
                      <span className="text-muted-foreground">
                        {ingredient.kcalPer100g.toFixed(1)} kcal/100g
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ingredient.groupIds
                        .map(
                          (groupId) =>
                            groupById.get(groupId)?.name ?? "Unknown",
                        )
                        .join(", ") || "Ungrouped"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="border-border/80 bg-card/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <BookOpenText className="h-4 w-4 text-sky-700" />
                Recipe Plans and Versions
              </CardTitle>
              <CardDescription>
                Recipes are plans. Cooking snapshots can drift from plan by
                using measured raw/finished weights.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Recipe name"
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                />
                <Input
                  placeholder="Description"
                  value={recipeDescription}
                  onChange={(event) => setRecipeDescription(event.target.value)}
                />
              </div>
              <Textarea
                placeholder="Instructions"
                value={recipeInstructions}
                onChange={(event) => setRecipeInstructions(event.target.value)}
              />
              <Input
                placeholder="Version notes"
                value={recipeNotes}
                onChange={(event) => setRecipeNotes(event.target.value)}
              />

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Planned ingredient
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={recipeLineIngredientId}
                    onChange={(event) =>
                      setRecipeLineIngredientId(
                        event.target.value as Id<"ingredients"> | "",
                      )
                    }
                  >
                    <option value="">Select ingredient</option>
                    {visibleIngredients.map((ingredient) => (
                      <option key={ingredient._id} value={ingredient._id}>
                        {ingredient.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Planned grams"
                    value={recipeLineWeight}
                    onChange={(event) =>
                      setRecipeLineWeight(event.target.value)
                    }
                  />
                  <Button variant="outline" onClick={addRecipeIngredientLine}>
                    Add line
                  </Button>
                </div>
                <Input
                  className="mt-3"
                  placeholder="Line note"
                  value={recipeLineNotes}
                  onChange={(event) => setRecipeLineNotes(event.target.value)}
                />
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Planned output
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1.1fr_1fr_1fr_auto]">
                  <Input
                    placeholder="Output name"
                    value={recipeOutputName}
                    onChange={(event) =>
                      setRecipeOutputName(event.target.value)
                    }
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={recipeOutputGroupId}
                    onChange={(event) =>
                      setRecipeOutputGroupId(
                        event.target.value as Id<"foodGroups"> | "",
                      )
                    }
                  >
                    <option value="">No group</option>
                    {visibleGroups.map((group) => (
                      <option key={group._id} value={group._id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Planned weight"
                    value={recipeOutputWeight}
                    onChange={(event) =>
                      setRecipeOutputWeight(event.target.value)
                    }
                  />
                  <Button variant="outline" onClick={addRecipeOutputLine}>
                    Add output
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Draft lines: {recipeIngredientLines.length} ingredients,{" "}
                  {recipeOutputLines.length} outputs
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {recipeIngredientLines.map((line, index) => (
                    <p key={`ingredient-line-${line.ingredientId}-${index}`}>
                      {ingredientById.get(line.ingredientId)?.name ?? "Missing"}{" "}
                      - {line.plannedWeightGrams.toFixed(1)}g
                    </p>
                  ))}
                  {recipeOutputLines.map((line, index) => (
                    <p key={`output-line-${line.name}-${index}`}>
                      Output: {line.name}
                      {line.plannedFinishedWeightGrams
                        ? ` (${line.plannedFinishedWeightGrams.toFixed(1)}g)`
                        : ""}
                    </p>
                  ))}
                </div>
              </div>

              <Button
                onClick={() =>
                  void runAction("Recipe created with version 1.", async () => {
                    await createRecipe({
                      name: recipeName,
                      description: recipeDescription.trim() || undefined,
                      instructions: recipeInstructions.trim() || undefined,
                      notes: recipeNotes.trim() || undefined,
                      plannedIngredients: recipeIngredientLines,
                      plannedOutputs: recipeOutputLines,
                    });
                    setRecipeName("");
                    setRecipeDescription("");
                    setRecipeInstructions("");
                    setRecipeNotes("");
                    setRecipeIngredientLines([]);
                    setRecipeOutputLines([]);
                  })
                }
              >
                Create recipe plan
              </Button>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Create next version from current
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={versionRecipeId}
                    onChange={(event) =>
                      setVersionRecipeId(
                        event.target.value as Id<"recipes"> | "",
                      )
                    }
                  >
                    <option value="">Select recipe</option>
                    {visibleRecipes.map((recipe) => (
                      <option key={recipe._id} value={recipe._id}>
                        {recipe.name} (v{recipe.latestVersionNumber})
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Version note"
                    value={versionNotes}
                    onChange={(event) => setVersionNotes(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={createNextRecipeVersionFromCurrent}
                  >
                    Create next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <ChefHat className="h-4 w-4 text-rose-700" />
                Cooking Sessions and Cooked Foods
              </CardTitle>
              <CardDescription>
                Every cooked food stores ingredient snapshots and calculated
                kcal/100g from measured finished weight.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Create cook session
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Session label"
                    value={sessionLabel}
                    onChange={(event) => setSessionLabel(event.target.value)}
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={sessionPersonId}
                    onChange={(event) =>
                      setSessionPersonId(
                        event.target.value as Id<"people"> | "",
                      )
                    }
                  >
                    <option value="">Cooked by (optional)</option>
                    {visiblePeople.map((person) => (
                      <option key={person._id} value={person._id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Textarea
                  className="mt-3"
                  placeholder="Session notes"
                  value={sessionNotes}
                  onChange={(event) => setSessionNotes(event.target.value)}
                />
                <Button
                  className="mt-3"
                  onClick={() =>
                    void runAction("Cook session created.", async () => {
                      await createCookSession({
                        label: sessionLabel.trim() || undefined,
                        cookedByPersonId: sessionPersonId || undefined,
                        notes: sessionNotes.trim() || undefined,
                      });
                      setSessionLabel("");
                      setSessionPersonId("");
                      setSessionNotes("");
                    })
                  }
                >
                  Add session
                </Button>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  Create cooked food
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={cookedFoodSessionId}
                    onChange={(event) =>
                      setCookedFoodSessionId(
                        event.target.value as Id<"cookSessions"> | "",
                      )
                    }
                  >
                    <option value="">Select session</option>
                    {data.cookSessions.map((session) => (
                      <option key={session._id} value={session._id}>
                        {session.label ?? formatTimestamp(session.cookedAt)}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Cooked food name"
                    value={cookedFoodName}
                    onChange={(event) => setCookedFoodName(event.target.value)}
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={cookedFoodGroupId}
                    onChange={(event) =>
                      setCookedFoodGroupId(
                        event.target.value as Id<"foodGroups"> | "",
                      )
                    }
                  >
                    <option value="">No group</option>
                    {visibleGroups.map((group) => (
                      <option key={group._id} value={group._id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Finished weight grams"
                    value={cookedFoodFinishedWeight}
                    onChange={(event) =>
                      setCookedFoodFinishedWeight(event.target.value)
                    }
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={cookedFoodRecipeVersionId}
                    onChange={(event) =>
                      setCookedFoodRecipeVersionId(
                        event.target.value as Id<"recipeVersions"> | "",
                      )
                    }
                  >
                    <option value="">No recipe link</option>
                    {data.recipeVersions
                      .filter((version) => version.isCurrent)
                      .map((version) => (
                        <option key={version._id} value={version._id}>
                          {version.name} v{version.versionNumber}
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="outline"
                    onClick={prefillCookedFoodFromRecipeVersion}
                  >
                    Prefill from recipe
                  </Button>
                </div>
                <Textarea
                  className="mt-3"
                  placeholder="Cooked food notes"
                  value={cookedFoodNotes}
                  onChange={(event) => setCookedFoodNotes(event.target.value)}
                />

                <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={cookedFoodIngredientId}
                    onChange={(event) =>
                      setCookedFoodIngredientId(
                        event.target.value as Id<"ingredients"> | "",
                      )
                    }
                  >
                    <option value="">Select ingredient</option>
                    {visibleIngredients.map((ingredient) => (
                      <option key={ingredient._id} value={ingredient._id}>
                        {ingredient.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Raw grams"
                    value={cookedFoodIngredientWeight}
                    onChange={(event) =>
                      setCookedFoodIngredientWeight(event.target.value)
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={addCookedFoodIngredientLine}
                  >
                    Add ingredient
                  </Button>
                </div>

                <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  {cookedFoodIngredients.map((line, index) => (
                    <p key={`cooked-line-${line.ingredientId}-${index}`}>
                      {ingredientById.get(line.ingredientId)?.name ?? "Missing"}{" "}
                      - {line.rawWeightGrams.toFixed(1)}g
                    </p>
                  ))}
                </div>

                <Button
                  className="mt-3"
                  onClick={() => {
                    if (!cookedFoodSessionId) {
                      return;
                    }
                    const linkedVersion = cookedFoodRecipeVersionId
                      ? versionById.get(cookedFoodRecipeVersionId)
                      : undefined;
                    void runAction("Cooked food added.", async () => {
                      await createCookedFood({
                        cookSessionId: cookedFoodSessionId,
                        name: cookedFoodName,
                        recipeId: linkedVersion?.recipeId,
                        recipeVersionId: cookedFoodRecipeVersionId || undefined,
                        groupIds: cookedFoodGroupId ? [cookedFoodGroupId] : [],
                        finishedWeightGrams: Number(cookedFoodFinishedWeight),
                        notes: cookedFoodNotes.trim() || undefined,
                        ingredients: cookedFoodIngredients,
                      });
                      setCookedFoodSessionId("");
                      setCookedFoodName("");
                      setCookedFoodGroupId("");
                      setCookedFoodFinishedWeight("");
                      setCookedFoodRecipeVersionId("");
                      setCookedFoodIngredientId("");
                      setCookedFoodIngredientWeight("");
                      setCookedFoodNotes("");
                      setCookedFoodIngredients([]);
                    });
                  }}
                >
                  Save cooked food
                </Button>
              </div>

              <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border p-3">
                {data.cookedFoods.map((food) => (
                  <div
                    key={food._id}
                    className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {food.name}
                      </span>
                      <span className="text-muted-foreground">
                        {food.kcalPer100g.toFixed(1)} kcal/100g
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Session:{" "}
                      {cookSessionById.get(food.cookSessionId)?.label ??
                        formatTimestamp(
                          cookSessionById.get(food.cookSessionId)?.cookedAt ??
                            0,
                        )}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-5 border-border/80 bg-card/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Target className="h-4 w-4 text-indigo-700" />
              Meals and Consumption Logs
            </CardTitle>
            <CardDescription>
              Meal items can point to either raw ingredients or cooked foods.
              Each item snapshots kcal used at log time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={mealPersonId}
                onChange={(event) =>
                  setMealPersonId(event.target.value as Id<"people"> | "")
                }
              >
                <option value="">Select person</option>
                {visiblePeople.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Meal name"
                value={mealName}
                onChange={(event) => setMealName(event.target.value)}
              />
              <Input
                type="datetime-local"
                value={mealEatenAt}
                onChange={(event) => setMealEatenAt(event.target.value)}
              />
              <Input
                placeholder="Meal notes"
                value={mealNotes}
                onChange={(event) => setMealNotes(event.target.value)}
              />
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">
                Add meal item
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={mealItemSourceType}
                  onChange={(event) => {
                    setMealItemSourceType(event.target.value as MealSourceType);
                    setMealIngredientId("");
                    setMealCookedFoodId("");
                  }}
                >
                  <option value="ingredient">Ingredient</option>
                  <option value="cookedFood">Cooked food</option>
                </select>

                {mealItemSourceType === "ingredient" ? (
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={mealIngredientId}
                    onChange={(event) =>
                      setMealIngredientId(
                        event.target.value as Id<"ingredients"> | "",
                      )
                    }
                  >
                    <option value="">Select ingredient</option>
                    {visibleIngredients.map((ingredient) => (
                      <option key={ingredient._id} value={ingredient._id}>
                        {ingredient.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={mealCookedFoodId}
                    onChange={(event) =>
                      setMealCookedFoodId(
                        event.target.value as Id<"cookedFoods"> | "",
                      )
                    }
                  >
                    <option value="">Select cooked food</option>
                    {data.cookedFoods.map((food) => (
                      <option key={food._id} value={food._id}>
                        {food.name}
                      </option>
                    ))}
                  </select>
                )}

                <Input
                  type="number"
                  placeholder="Consumed grams"
                  value={mealItemWeight}
                  onChange={(event) => setMealItemWeight(event.target.value)}
                />

                <Button variant="outline" onClick={addMealItem}>
                  Add item
                </Button>
              </div>

              <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                {mealItems.map((item, index) => {
                  const label =
                    item.sourceType === "ingredient"
                      ? ingredientById.get(
                          item.ingredientId as Id<"ingredients">,
                        )?.name
                      : data.cookedFoods.find(
                          (food) => food._id === item.cookedFoodId,
                        )?.name;
                  return (
                    <p key={`meal-item-${index}`}>
                      {item.sourceType}: {label ?? "Missing"} -{" "}
                      {item.consumedWeightGrams.toFixed(1)}g
                    </p>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={() => {
                if (!mealPersonId) {
                  return;
                }
                const parsedEatenAt = new Date(mealEatenAt).getTime();
                void runAction("Meal logged.", async () => {
                  await createMeal({
                    personId: mealPersonId,
                    name: mealName.trim() || undefined,
                    eatenAt: Number.isFinite(parsedEatenAt)
                      ? parsedEatenAt
                      : undefined,
                    notes: mealNotes.trim() || undefined,
                    items: mealItems,
                  });
                  setMealPersonId("");
                  setMealName("");
                  setMealEatenAt(toDateTimeLocalValue(Date.now()));
                  setMealNotes("");
                  setMealItems([]);
                  setMealItemWeight("");
                  setMealIngredientId("");
                  setMealCookedFoodId("");
                });
              }}
            >
              Save meal log
            </Button>

            <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-border p-3">
              {data.meals.map((meal) => {
                const mealItemsForMeal = mealItemsByMealId.get(meal._id) ?? [];
                const totalCalories = mealItemsForMeal.reduce(
                  (sum, item) => sum + item.caloriesSnapshot,
                  0,
                );
                return (
                  <div
                    key={meal._id}
                    className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {meal.name ?? "Meal"} -{" "}
                        {peopleById.get(meal.personId)?.name}
                      </span>
                      <span className="text-muted-foreground">
                        {totalCalories.toFixed(0)} kcal
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatTimestamp(meal.eatenAt)} -{" "}
                      {mealItemsForMeal.length} items
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function SummaryBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) {
    return "N/A";
  }
  return new Date(timestamp).toLocaleString();
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
}
