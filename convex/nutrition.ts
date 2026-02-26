import {
  mutation,
  query,
  type DatabaseWriter,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const nutritionUnitValidator = v.union(
  v.literal("pinch"),
  v.literal("teaspoon"),
  v.literal("tablespoon"),
  v.literal("piece"),
  v.literal("g"),
  v.literal("ml"),
);

const groupScopeValidator = v.union(
  v.literal("ingredient"),
  v.literal("cookedFood"),
);

const recipeIngredientValidator = v.union(
  v.object({
    sourceType: v.literal("ingredient"),
    ingredientId: v.id("ingredients"),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    notes: v.optional(v.string()),
  }),
  v.object({
    sourceType: v.literal("custom"),
    name: v.string(),
    kcalPer100: v.number(),
    ignoreCalories: v.boolean(),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    saveToCatalog: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  }),
);

const cookedFoodIngredientValidator = v.union(
  v.object({
    sourceType: v.literal("ingredient"),
    ingredientId: v.id("ingredients"),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    countedAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
  }),
  v.object({
    sourceType: v.literal("custom"),
    name: v.string(),
    kcalPer100: v.number(),
    kcalBasisUnit: v.optional(nutritionUnitValidator),
    ignoreCalories: v.boolean(),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    countedAmount: v.optional(v.number()),
    saveToCatalog: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  }),
);

const cookedFoodRecipeDraftValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  instructions: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const mealItemInputValidator = v.union(
  v.object({
    sourceType: v.literal("ingredient"),
    ingredientId: v.id("ingredients"),
    consumedWeightGrams: v.number(),
    notes: v.optional(v.string()),
  }),
  v.object({
    sourceType: v.literal("custom"),
    name: v.string(),
    kcalPer100: v.number(),
    ignoreCalories: v.boolean(),
    consumedWeightGrams: v.number(),
    saveToCatalog: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  }),
  v.object({
    sourceType: v.literal("cookedFood"),
    cookedFoodId: v.id("cookedFoods"),
    consumedWeightGrams: v.number(),
    notes: v.optional(v.string()),
  }),
);

function assertNonEmpty(value: string, fieldName: string) {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
}

function assertPositive(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }
}

function assertNonNegative(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be 0 or greater.`);
  }
}

function normalizeKcalPer100(
  value: number,
  options: { allowZero: boolean; fieldName: string },
) {
  if (options.allowZero) {
    assertNonNegative(value, options.fieldName);
  } else {
    assertPositive(value, options.fieldName);
  }
  const normalized = Math.round(value);
  if (options.allowZero) {
    assertNonNegative(normalized, options.fieldName);
  } else {
    assertPositive(normalized, options.fieldName);
  }
  return normalized;
}

function assertOwnedOrThrow<
  TDoc extends {
    ownerUserId?: string;
  } | null,
>(doc: TDoc, ownerUserId: string, notFoundMessage: string) {
  if (!doc || doc.ownerUserId !== ownerUserId) {
    throw new Error(notFoundMessage);
  }
  return doc;
}

async function requireAuthenticatedUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  return identity.subject;
}

function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(value: string | undefined, fallbackDate: number) {
  if (!value) {
    return toLocalDateString(fallbackDate);
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }
  return trimmed;
}

function mealDateKey(meal: { eatenOn: string }) {
  return meal.eatenOn;
}

type NutritionUnit = "pinch" | "teaspoon" | "tablespoon" | "piece" | "g" | "ml";

function getIngredientKcalPer100(ingredient: { kcalPer100: number }) {
  return normalizeKcalPer100(ingredient.kcalPer100, {
    allowZero: true,
    fieldName: "Ingredient kcal/100",
  });
}

function getIngredientBasisUnit(ingredient: { kcalBasisUnit?: NutritionUnit }) {
  return ingredient.kcalBasisUnit ?? "g";
}

function getIngredientIgnoreCalories(ingredient: { ignoreCalories?: boolean }) {
  return Boolean(ingredient.ignoreCalories);
}

async function saveCustomIngredientToCatalog(
  db: DatabaseWriter,
  ownerUserId: string,
  createdIngredientByKey: Map<string, Id<"ingredients">>,
  now: number,
  customIngredient: {
    name: string;
    kcalPer100: number;
    ignoreCalories: boolean;
  },
) {
  const normalizedKcalPer100 = normalizeKcalPer100(customIngredient.kcalPer100, {
    allowZero: customIngredient.ignoreCalories,
    fieldName: "Custom ingredient kcal/100",
  });
  const dedupeKey = [
    customIngredient.name.toLowerCase(),
    String(normalizedKcalPer100),
    customIngredient.ignoreCalories ? "ignore" : "count",
  ].join("::");

  const cachedId = createdIngredientByKey.get(dedupeKey);
  if (cachedId) {
    return cachedId;
  }

  const ingredientId = await db.insert("ingredients", {
    ownerUserId,
    name: customIngredient.name,
    brand: undefined,
    kcalPer100: normalizedKcalPer100,
    ignoreCalories: customIngredient.ignoreCalories,
    groupIds: [],
    notes: undefined,
    archived: false,
    createdAt: now,
  });
  createdIngredientByKey.set(dedupeKey, ingredientId);
  return ingredientId;
}

async function buildCookedFoodNutrition(
  db: DatabaseWriter,
  ownerUserId: string,
  ingredients: Array<
    | {
        sourceType: "ingredient";
        ingredientId: Id<"ingredients">;
        referenceAmount: number;
        referenceUnit: NutritionUnit;
        countedAmount?: number;
        notes?: string;
      }
    | {
        sourceType: "custom";
        name: string;
        kcalPer100: number;
        kcalBasisUnit?: NutritionUnit;
        ignoreCalories: boolean;
        referenceAmount: number;
        referenceUnit: NutritionUnit;
        countedAmount?: number;
        saveToCatalog?: boolean;
        notes?: string;
      }
  >,
  finishedWeightGrams: number,
  options?: {
    persistAllCustomIngredients?: boolean;
  },
) {
  assertPositive(finishedWeightGrams, "Finished weight");
  if (ingredients.length === 0) {
    throw new Error("At least one ingredient is required.");
  }

  const now = Date.now();
  const createdIngredientByKey = new Map<string, Id<"ingredients">>();
  const persistAllCustomIngredients =
    options?.persistAllCustomIngredients ?? false;
  let totalRawWeightGrams = 0;
  let totalCalories = 0;
  const ingredientSnapshots: Array<{
    sourceType: "ingredient" | "custom";
    ingredientId?: Id<"ingredients">;
    ingredientNameSnapshot: string;
    referenceAmount: number;
    referenceUnit: NutritionUnit;
    countedAmount?: number;
    ingredientKcalPer100Snapshot: number;
    ingredientKcalBasisUnitSnapshot: NutritionUnit;
    ignoreCaloriesSnapshot: boolean;
    ingredientCaloriesSnapshot: number;
    notes?: string;
  }> = [];
  for (const line of ingredients) {
    assertPositive(line.referenceAmount, "Ingredient amount");
    if (line.sourceType === "ingredient") {
      const ingredient = await db.get(line.ingredientId);
      if (!ingredient || ingredient.ownerUserId !== ownerUserId) {
        throw new Error("One or more ingredients are missing.");
      }
      const ignoreCalories = getIngredientIgnoreCalories(ingredient);
      const ingredientKcalPer100 = getIngredientKcalPer100(ingredient);
      if (!ignoreCalories) {
        assertPositive(ingredientKcalPer100, "Ingredient kcal/100");
        assertPositive(line.countedAmount ?? NaN, "Counted amount");
      }
      const countedAmount =
        line.countedAmount !== undefined && Number.isFinite(line.countedAmount)
          ? line.countedAmount
          : undefined;
      if (countedAmount !== undefined) {
        assertPositive(countedAmount, "Counted amount");
        totalRawWeightGrams += countedAmount;
      }
      const ingredientCalories =
        ignoreCalories || countedAmount === undefined
          ? 0
          : (countedAmount * ingredientKcalPer100) / 100;
      totalCalories += ingredientCalories;
      ingredientSnapshots.push({
        sourceType: "ingredient",
        ingredientId: ingredient._id,
        ingredientNameSnapshot: ingredient.name,
        referenceAmount: line.referenceAmount,
        referenceUnit: line.referenceUnit,
        countedAmount,
        ingredientKcalPer100Snapshot: ingredientKcalPer100,
        ingredientKcalBasisUnitSnapshot: getIngredientBasisUnit(ingredient),
        ignoreCaloriesSnapshot: ignoreCalories,
        ingredientCaloriesSnapshot: ingredientCalories,
        notes: line.notes?.trim() || undefined,
      });
      continue;
    }

    assertNonEmpty(line.name, "Custom ingredient name");
    const normalizedKcalPer100 = normalizeKcalPer100(line.kcalPer100, {
      allowZero: line.ignoreCalories,
      fieldName: "Custom ingredient kcal/100",
    });
    const ingredientName = line.name.trim();
    const ignoreCalories = Boolean(line.ignoreCalories);
    if (!ignoreCalories) {
      assertPositive(line.countedAmount ?? NaN, "Counted amount");
    }
    const countedAmount =
      line.countedAmount !== undefined && Number.isFinite(line.countedAmount)
        ? line.countedAmount
        : undefined;
    if (countedAmount !== undefined) {
      assertPositive(countedAmount, "Counted amount");
      totalRawWeightGrams += countedAmount;
    }
    const shouldSaveToCatalog =
      persistAllCustomIngredients || Boolean(line.saveToCatalog);
    let savedIngredientId: Id<"ingredients"> | undefined;
    if (shouldSaveToCatalog) {
      savedIngredientId = await saveCustomIngredientToCatalog(
        db,
        ownerUserId,
        createdIngredientByKey,
        now,
        {
          name: ingredientName,
          kcalPer100: normalizedKcalPer100,
          ignoreCalories,
        },
      );
    }

    const ingredientCalories =
      ignoreCalories || countedAmount === undefined
        ? 0
        : (countedAmount * normalizedKcalPer100) / 100;
    totalCalories += ingredientCalories;
    ingredientSnapshots.push({
      sourceType: "custom",
      ingredientId: savedIngredientId,
      ingredientNameSnapshot: ingredientName,
      referenceAmount: line.referenceAmount,
      referenceUnit: line.referenceUnit,
      countedAmount,
      ingredientKcalPer100Snapshot: normalizedKcalPer100,
      ingredientKcalBasisUnitSnapshot: "g",
      ignoreCaloriesSnapshot: ignoreCalories,
      ingredientCaloriesSnapshot: ingredientCalories,
      notes: line.notes?.trim() || undefined,
    });
  }

  return {
    totalRawWeightGrams,
    totalCalories,
    kcalPer100: (totalCalories / finishedWeightGrams) * 100,
    ingredientSnapshots,
  };
}

async function resolveRecipeIngredientLines(
  db: DatabaseWriter,
  ownerUserId: string,
  ingredientLines: Array<
    | {
        sourceType: "ingredient";
        ingredientId: Id<"ingredients">;
        referenceAmount: number;
        referenceUnit: NutritionUnit;
        notes?: string;
      }
    | {
        sourceType: "custom";
        name: string;
        kcalPer100: number;
        ignoreCalories: boolean;
        referenceAmount: number;
        referenceUnit: NutritionUnit;
        saveToCatalog?: boolean;
        notes?: string;
      }
  >,
  options?: {
    persistAllCustomIngredients?: boolean;
  },
) {
  if (ingredientLines.length === 0) {
    throw new Error("Recipe needs at least one ingredient.");
  }
  const now = Date.now();
  const persistAllCustomIngredients =
    options?.persistAllCustomIngredients ?? false;
  const createdIngredientByKey = new Map<string, Id<"ingredients">>();
  const resolvedLines: Array<{
    sourceType: "ingredient" | "custom";
    ingredientId?: Id<"ingredients">;
    ingredientNameSnapshot: string;
    kcalPer100Snapshot: number;
    kcalBasisUnitSnapshot: NutritionUnit;
    ignoreCaloriesSnapshot: boolean;
    referenceAmount: number;
    referenceUnit: NutritionUnit;
    notes?: string;
  }> = [];
  for (const line of ingredientLines) {
    assertPositive(line.referenceAmount, "Ingredient amount");
    if (line.sourceType === "ingredient") {
      const ingredient = await db.get(line.ingredientId);
      if (!ingredient || ingredient.ownerUserId !== ownerUserId) {
        throw new Error("One or more ingredients are missing.");
      }
      const ignoreCaloriesSnapshot = getIngredientIgnoreCalories(ingredient);
      const kcalPer100Snapshot = getIngredientKcalPer100(ingredient);
      if (!ignoreCaloriesSnapshot) {
        assertPositive(kcalPer100Snapshot, "Ingredient kcal/100");
      }
      resolvedLines.push({
        sourceType: "ingredient",
        ingredientId: ingredient._id,
        ingredientNameSnapshot: ingredient.name,
        kcalPer100Snapshot,
        kcalBasisUnitSnapshot: getIngredientBasisUnit(ingredient),
        ignoreCaloriesSnapshot,
        referenceAmount: line.referenceAmount,
        referenceUnit: line.referenceUnit,
        notes: line.notes?.trim() || undefined,
      });
      continue;
    }

    assertNonEmpty(line.name, "Custom ingredient name");
    const normalizedKcalPer100 = normalizeKcalPer100(line.kcalPer100, {
      allowZero: line.ignoreCalories,
      fieldName: "Custom ingredient kcal/100",
    });
    const ingredientName = line.name.trim();
    const ignoreCalories = Boolean(line.ignoreCalories);
    const shouldSaveToCatalog =
      persistAllCustomIngredients || Boolean(line.saveToCatalog);
    let ingredientId: Id<"ingredients"> | undefined;
    if (shouldSaveToCatalog) {
      ingredientId = await saveCustomIngredientToCatalog(
        db,
        ownerUserId,
        createdIngredientByKey,
        now,
        {
          name: ingredientName,
          kcalPer100: normalizedKcalPer100,
          ignoreCalories,
        },
      );
    }

    resolvedLines.push({
      sourceType: "custom",
      ingredientId,
      ingredientNameSnapshot: ingredientName,
      kcalPer100Snapshot: normalizedKcalPer100,
      kcalBasisUnitSnapshot: "g",
      ignoreCaloriesSnapshot: ignoreCalories,
      referenceAmount: line.referenceAmount,
      referenceUnit: line.referenceUnit,
      notes: line.notes?.trim() || undefined,
    });
  }

  return resolvedLines;
}

async function buildMealItemSnapshots(
  db: DatabaseWriter,
  ownerUserId: string,
  items: Array<
    | {
        sourceType: "ingredient";
        ingredientId?: Id<"ingredients">;
        consumedWeightGrams: number;
        notes?: string;
      }
    | {
        sourceType: "custom";
        name: string;
        kcalPer100: number;
        ignoreCalories: boolean;
        consumedWeightGrams: number;
        saveToCatalog?: boolean;
        notes?: string;
      }
    | {
        sourceType: "cookedFood";
        cookedFoodId?: Id<"cookedFoods">;
        consumedWeightGrams: number;
        notes?: string;
      }
  >,
) {
  if (items.length === 0) {
    throw new Error("At least one meal item is required.");
  }
  const createdIngredientByKey = new Map<string, Id<"ingredients">>();
  const now = Date.now();

  return await Promise.all(
    items.map(async (item) => {
      if (item.sourceType === "ingredient") {
        if (!item.ingredientId) {
          throw new Error("Ingredient meal item is missing ingredientId.");
        }
        const ingredient = await db.get(item.ingredientId);
        if (!ingredient || ingredient.ownerUserId !== ownerUserId) {
          throw new Error("Meal ingredient not found.");
        }
        assertPositive(item.consumedWeightGrams, "Consumed weight");
        const consumedWeightGrams = item.consumedWeightGrams;
        const ignoreCalories = getIngredientIgnoreCalories(ingredient);
        const ingredientKcalPer100 = getIngredientKcalPer100(ingredient);
        if (!ignoreCalories) {
          assertPositive(ingredientKcalPer100, "Ingredient kcal/100");
        }
        const calories =
          ignoreCalories
            ? 0
            : (consumedWeightGrams * ingredientKcalPer100) / 100;
        return {
          sourceType: item.sourceType,
          ingredientId: ingredient._id,
          cookedFoodId: undefined,
          nameSnapshot: ingredient.name,
          consumedWeightGrams,
          kcalPer100Snapshot: ingredientKcalPer100,
          kcalBasisUnitSnapshot: "g" as const,
          ignoreCaloriesSnapshot: ignoreCalories,
          caloriesSnapshot: calories,
          notes: item.notes?.trim() || undefined,
        };
      }

      if (item.sourceType === "custom") {
        assertNonEmpty(item.name, "Custom ingredient name");
        const ingredientName = item.name.trim();
        const normalizedKcalPer100 = normalizeKcalPer100(item.kcalPer100, {
          allowZero: item.ignoreCalories,
          fieldName: "Custom ingredient kcal/100",
        });
        assertPositive(item.consumedWeightGrams, "Consumed weight");
        const consumedWeightGrams = item.consumedWeightGrams;
        let ingredientId: Id<"ingredients"> | undefined;
        if (item.saveToCatalog) {
          ingredientId = await saveCustomIngredientToCatalog(
            db,
            ownerUserId,
            createdIngredientByKey,
            now,
            {
              name: ingredientName,
              kcalPer100: normalizedKcalPer100,
              ignoreCalories: item.ignoreCalories,
            },
          );
        }

        const calories = item.ignoreCalories
          ? 0
          : (consumedWeightGrams * normalizedKcalPer100) / 100;
        return {
          sourceType: "custom" as const,
          ingredientId,
          cookedFoodId: undefined,
          nameSnapshot: ingredientName,
          consumedWeightGrams,
          kcalPer100Snapshot: normalizedKcalPer100,
          kcalBasisUnitSnapshot: "g" as const,
          ignoreCaloriesSnapshot: item.ignoreCalories,
          caloriesSnapshot: calories,
          notes: item.notes?.trim() || undefined,
        };
      }

      if (!item.cookedFoodId) {
        throw new Error("Cooked food meal item is missing cookedFoodId.");
      }
      assertPositive(item.consumedWeightGrams, "Consumed weight");
      const cookedFood = await db.get(item.cookedFoodId);
      if (!cookedFood || cookedFood.ownerUserId !== ownerUserId) {
        throw new Error("Meal cooked food item not found.");
      }
      const rawCookedFoodKcalPer100 = cookedFood.kcalPer100;
      if (rawCookedFoodKcalPer100 === undefined) {
        throw new Error("Meal cooked food has invalid kcal/100.");
      }
      const cookedFoodKcalPer100 = normalizeKcalPer100(rawCookedFoodKcalPer100, {
        allowZero: true,
        fieldName: "Meal cooked food kcal/100",
      });
      const calories = (item.consumedWeightGrams * cookedFoodKcalPer100) / 100;
      return {
        sourceType: item.sourceType,
        ingredientId: undefined,
        cookedFoodId: cookedFood._id,
        nameSnapshot: cookedFood.name,
        consumedWeightGrams: item.consumedWeightGrams,
        kcalPer100Snapshot: cookedFoodKcalPer100,
        kcalBasisUnitSnapshot: "g" as const,
        ignoreCaloriesSnapshot: false,
        caloriesSnapshot: calories,
        notes: item.notes?.trim() || undefined,
      };
    }),
  );
}

async function touchCookSession(
  ctx: MutationCtx,
  ownerUserId: string,
  sessionId: Id<"cookSessions">,
  updatedAt = Date.now(),
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.ownerUserId !== ownerUserId) {
    return;
  }
  await ctx.db.patch(sessionId, { updatedAt });
}

async function deleteCookedFoodWithChildren(
  ctx: MutationCtx,
  ownerUserId: string,
  cookedFoodId: Id<"cookedFoods">,
) {
  const cookedFood = assertOwnedOrThrow(
    await ctx.db.get(cookedFoodId),
    ownerUserId,
    "Cooked food not found.",
  );
  const mealRefs = await ctx.db
    .query("mealItems")
    .withIndex("by_cookedFood", (q) => q.eq("cookedFoodId", cookedFoodId))
    .collect();
  if (mealRefs.some((row) => row.ownerUserId === ownerUserId)) {
    throw new Error("Cooked food is in meal history. Archive instead.");
  }

  const ingredientRows = await ctx.db
    .query("cookedFoodIngredients")
    .withIndex("by_cookedFood", (q) => q.eq("cookedFoodId", cookedFoodId))
    .collect();
  await Promise.all(
    ingredientRows
      .filter((row) => row.ownerUserId === ownerUserId)
      .map((row) => ctx.db.delete(row._id)),
  );

  await ctx.db.delete(cookedFoodId);
  return cookedFood.cookSessionId;
}

export const getManagementData = query({
  args: {},
  handler: async (ctx) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    const [
      people,
      personGoalHistory,
      foodGroups,
      ingredients,
      recipes,
      recipeVersions,
      recipeVersionIngredients,
      cookSessions,
      cookedFoods,
      cookedFoodIngredients,
      meals,
      mealItems,
    ] = await Promise.all([
      ctx.db
        .query("people")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("personGoalHistory")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("foodGroups")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("ingredients")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("recipes")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("recipeVersions")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("recipeVersionIngredients")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("cookSessions")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("cookedFoods")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("cookedFoodIngredients")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("meals")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("mealItems")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
    ]);

    return {
      people: people.sort((a, b) => a.name.localeCompare(b.name)),
      personGoalHistory: personGoalHistory.sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
      foodGroups: foodGroups.sort((a, b) => a.name.localeCompare(b.name)),
      ingredients: ingredients.sort((a, b) => a.name.localeCompare(b.name)),
      recipes: recipes.sort((a, b) => b.createdAt - a.createdAt),
      recipeVersions: recipeVersions.sort((a, b) => b.createdAt - a.createdAt),
      recipeVersionIngredients,
      cookSessions: cookSessions.sort(
        (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
      ),
      cookedFoods: cookedFoods.sort((a, b) => b.createdAt - a.createdAt),
      cookedFoodIngredients,
      meals: meals.sort((a, b) => {
        const aDate = mealDateKey(a);
        const bDate = mealDateKey(b);
        if (aDate === bDate) {
          return b.createdAt - a.createdAt;
        }
        return aDate < bDate ? 1 : -1;
      }),
      mealItems,
    };
  },
});

export const createPerson = mutation({
  args: {
    name: v.string(),
    currentDailyGoalKcal: v.number(),
    notes: v.optional(v.string()),
    effectiveDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertNonEmpty(args.name, "Name");
    assertPositive(args.currentDailyGoalKcal, "Daily goal");
    const now = Date.now();
    const personId = await ctx.db.insert("people", {
      ownerUserId,
      name: args.name.trim(),
      notes: args.notes?.trim() || undefined,
      currentDailyGoalKcal: args.currentDailyGoalKcal,
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("personGoalHistory", {
      ownerUserId,
      personId,
      effectiveDate: normalizeDate(args.effectiveDate, now),
      goalKcal: args.currentDailyGoalKcal,
      reason: "Initial goal",
      createdAt: now,
    });
    return personId;
  },
});

export const updatePerson = mutation({
  args: {
    personId: v.id("people"),
    name: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      "Person not found.",
    );
    assertNonEmpty(args.name, "Name");
    await ctx.db.patch(args.personId, {
      name: args.name.trim(),
      notes: args.notes?.trim() || undefined,
    });
  },
});

export const updatePersonGoal = mutation({
  args: {
    personId: v.id("people"),
    goalKcal: v.number(),
    effectiveDate: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertPositive(args.goalKcal, "Goal");
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      "Person not found.",
    );
    const now = Date.now();
    await ctx.db.patch(args.personId, {
      currentDailyGoalKcal: args.goalKcal,
    });
    await ctx.db.insert("personGoalHistory", {
      ownerUserId,
      personId: args.personId,
      effectiveDate: normalizeDate(args.effectiveDate, now),
      goalKcal: args.goalKcal,
      reason: args.reason?.trim() || undefined,
      createdAt: now,
    });
  },
});

export const setPersonArchived = mutation({
  args: {
    personId: v.id("people"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      "Person not found.",
    );
    await ctx.db.patch(args.personId, { active: !args.archived });
  },
});

export const deletePerson = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      "Person not found.",
    );
    const [mealRefs, cookingRefs] = await Promise.all([
      ctx.db
        .query("meals")
        .withIndex("by_person_eatenOn", (q) => q.eq("personId", args.personId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
      ctx.db
        .query("cookSessions")
        .withIndex("by_person", (q) => q.eq("cookedByPersonId", args.personId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
    ]);
    if (
      mealRefs.length > 0 ||
      cookingRefs.some((c) => c.cookedByPersonId === args.personId)
    ) {
      throw new Error(
        "Cannot delete person with meal/cooking history. Archive instead.",
      );
    }
    const goalRows = await ctx.db
      .query("personGoalHistory")
      .withIndex("by_person_createdAt", (q) => q.eq("personId", args.personId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));
    await Promise.all(goalRows.map((row) => ctx.db.delete(row._id)));
    await ctx.db.delete(args.personId);
  },
});

export const createFoodGroup = mutation({
  args: {
    name: v.string(),
    appliesTo: groupScopeValidator,
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertNonEmpty(args.name, "Group name");
    const now = Date.now();
    return await ctx.db.insert("foodGroups", {
      ownerUserId,
      name: args.name.trim(),
      appliesTo: args.appliesTo,
      archived: false,
      createdAt: now,
    });
  },
});

export const updateFoodGroup = mutation({
  args: {
    groupId: v.id("foodGroups"),
    name: v.string(),
    appliesTo: groupScopeValidator,
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertNonEmpty(args.name, "Group name");
    assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      ownerUserId,
      "Group not found.",
    );
    await ctx.db.patch(args.groupId, {
      name: args.name.trim(),
      appliesTo: args.appliesTo,
    });
  },
});

export const setFoodGroupArchived = mutation({
  args: {
    groupId: v.id("foodGroups"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      ownerUserId,
      "Group not found.",
    );
    await ctx.db.patch(args.groupId, { archived: args.archived });
  },
});

export const deleteFoodGroup = mutation({
  args: { groupId: v.id("foodGroups") },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      ownerUserId,
      "Group not found.",
    );
    const [ingredients, cookedFoods] = await Promise.all([
      ctx.db
        .query("ingredients")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("cookedFoods")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
    ]);
    const inUse =
      ingredients.some((item) => item.groupIds.includes(args.groupId)) ||
      cookedFoods.some((item) => item.groupIds.includes(args.groupId));
    if (inUse) {
      throw new Error(
        "Group is used by records. Archive instead or remove references first.",
      );
    }
    await ctx.db.delete(args.groupId);
  },
});

export const createIngredient = mutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100: v.number(),
    ignoreCalories: v.boolean(),
    groupIds: v.array(v.id("foodGroups")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertNonEmpty(args.name, "Ingredient name");
    const normalizedKcalPer100 = normalizeKcalPer100(args.kcalPer100, {
      allowZero: args.ignoreCalories,
      fieldName: "kcal/100",
    });
    const groups = await Promise.all(
      args.groupIds.map((groupId) => ctx.db.get(groupId)),
    );
    if (groups.some((group) => !group || group.ownerUserId !== ownerUserId)) {
      throw new Error("One or more groups are missing.");
    }

    const now = Date.now();
    return await ctx.db.insert("ingredients", {
      ownerUserId,
      name: args.name.trim(),
      brand: args.brand?.trim() || undefined,
      kcalPer100: normalizedKcalPer100,
      ignoreCalories: args.ignoreCalories,
      groupIds: args.groupIds,
      notes: args.notes?.trim() || undefined,
      archived: false,
      createdAt: now,
    });
  },
});

export const updateIngredient = mutation({
  args: {
    ingredientId: v.id("ingredients"),
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100: v.number(),
    ignoreCalories: v.boolean(),
    groupIds: v.array(v.id("foodGroups")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      ownerUserId,
      "Ingredient not found.",
    );
    assertNonEmpty(args.name, "Ingredient name");
    const normalizedKcalPer100 = normalizeKcalPer100(args.kcalPer100, {
      allowZero: args.ignoreCalories,
      fieldName: "kcal/100",
    });
    await ctx.db.patch(args.ingredientId, {
      name: args.name.trim(),
      brand: args.brand?.trim() || undefined,
      kcalPer100: normalizedKcalPer100,
      ignoreCalories: args.ignoreCalories,
      groupIds: args.groupIds,
      notes: args.notes?.trim() || undefined,
    });
  },
});

export const normalizeKcalValuesToIntegers = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    const dryRun = Boolean(args.dryRun);
    const summary = {
      ingredients: 0,
      recipeVersionIngredients: 0,
      cookedFoods: 0,
      cookedFoodIngredients: 0,
      mealItems: 0,
    };

    const [
      ingredients,
      recipeVersionIngredients,
      cookedFoods,
      cookedFoodIngredients,
      mealItems,
    ] = await Promise.all([
      ctx.db
        .query("ingredients")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("recipeVersionIngredients")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("cookedFoods")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("cookedFoodIngredients")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
      ctx.db
        .query("mealItems")
        .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
        .collect(),
    ]);

    for (const ingredient of ingredients) {
      const normalized = normalizeKcalPer100(ingredient.kcalPer100, {
        allowZero: Boolean(ingredient.ignoreCalories),
        fieldName: "Ingredient kcal/100",
      });
      if (ingredient.kcalPer100 !== normalized) {
        summary.ingredients += 1;
        if (!dryRun) {
          await ctx.db.patch(ingredient._id, { kcalPer100: normalized });
        }
      }
    }

    for (const line of recipeVersionIngredients) {
      if (line.kcalPer100Snapshot === undefined) {
        continue;
      }
      const normalized = normalizeKcalPer100(line.kcalPer100Snapshot, {
        allowZero: Boolean(line.ignoreCaloriesSnapshot),
        fieldName: "Recipe ingredient kcal/100",
      });
      if (line.kcalPer100Snapshot !== normalized) {
        summary.recipeVersionIngredients += 1;
        if (!dryRun) {
          await ctx.db.patch(line._id, { kcalPer100Snapshot: normalized });
        }
      }
    }

    for (const cookedFood of cookedFoods) {
      if (cookedFood.kcalPer100 === undefined) {
        continue;
      }
      const normalized = normalizeKcalPer100(cookedFood.kcalPer100, {
        allowZero: true,
        fieldName: "Cooked food kcal/100",
      });
      if (cookedFood.kcalPer100 !== normalized) {
        summary.cookedFoods += 1;
        if (!dryRun) {
          await ctx.db.patch(cookedFood._id, { kcalPer100: normalized });
        }
      }
    }

    for (const line of cookedFoodIngredients) {
      if (line.ingredientKcalPer100Snapshot === undefined) {
        continue;
      }
      const normalized = normalizeKcalPer100(line.ingredientKcalPer100Snapshot, {
        allowZero: Boolean(line.ignoreCaloriesSnapshot),
        fieldName: "Cooked food ingredient kcal/100",
      });
      if (line.ingredientKcalPer100Snapshot !== normalized) {
        summary.cookedFoodIngredients += 1;
        if (!dryRun) {
          await ctx.db.patch(line._id, {
            ingredientKcalPer100Snapshot: normalized,
          });
        }
      }
    }

    for (const item of mealItems) {
      if (item.kcalPer100Snapshot === undefined) {
        continue;
      }
      const normalized = normalizeKcalPer100(item.kcalPer100Snapshot, {
        allowZero: Boolean(item.ignoreCaloriesSnapshot),
        fieldName: "Meal item kcal/100",
      });
      if (item.kcalPer100Snapshot !== normalized) {
        summary.mealItems += 1;
        if (!dryRun) {
          await ctx.db.patch(item._id, { kcalPer100Snapshot: normalized });
        }
      }
    }

    const totalPatched =
      summary.ingredients +
      summary.recipeVersionIngredients +
      summary.cookedFoods +
      summary.cookedFoodIngredients +
      summary.mealItems;

    return {
      dryRun,
      ...summary,
      totalPatched,
    };
  },
});

export const setIngredientArchived = mutation({
  args: {
    ingredientId: v.id("ingredients"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      ownerUserId,
      "Ingredient not found.",
    );
    await ctx.db.patch(args.ingredientId, { archived: args.archived });
  },
});

export const deleteIngredient = mutation({
  args: { ingredientId: v.id("ingredients") },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      ownerUserId,
      "Ingredient not found.",
    );
    const [recipeRefs, cookedRefs, mealRefs] = await Promise.all([
      ctx.db
        .query("recipeVersionIngredients")
        .withIndex("by_ingredient", (q) =>
          q.eq("ingredientId", args.ingredientId),
        )
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
      ctx.db
        .query("cookedFoodIngredients")
        .withIndex("by_ingredient", (q) =>
          q.eq("ingredientId", args.ingredientId),
        )
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
      ctx.db
        .query("mealItems")
        .withIndex("by_ingredient", (q) =>
          q.eq("ingredientId", args.ingredientId),
        )
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
    ]);
    const used =
      recipeRefs.some((item) => item.ingredientId === args.ingredientId) ||
      cookedRefs.some((item) => item.ingredientId === args.ingredientId) ||
      mealRefs.some((item) => item.ingredientId === args.ingredientId);
    if (used) {
      throw new Error("Ingredient is in historical records. Archive instead.");
    }
    await ctx.db.delete(args.ingredientId);
  },
});

export const createRecipe = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredientLines: v.array(recipeIngredientValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertNonEmpty(args.name, "Recipe name");
    const resolvedLines = await resolveRecipeIngredientLines(
      ctx.db,
      ownerUserId,
      args.ingredientLines,
    );

    const now = Date.now();
    const recipeId = await ctx.db.insert("recipes", {
      ownerUserId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      archived: false,
      latestVersionNumber: 1,
      createdAt: now,
    });

    const versionId = await ctx.db.insert("recipeVersions", {
      ownerUserId,
      recipeId,
      versionNumber: 1,
      name: args.name.trim(),
      instructions: args.instructions?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      isCurrent: true,
      createdAt: now,
    });

    await Promise.all(
      resolvedLines.map((line) =>
        ctx.db.insert("recipeVersionIngredients", {
          ownerUserId,
          recipeVersionId: versionId,
          sourceType: line.sourceType,
          ingredientId: line.ingredientId,
          ingredientNameSnapshot: line.ingredientNameSnapshot,
          kcalPer100Snapshot: line.kcalPer100Snapshot,
          kcalBasisUnitSnapshot: line.kcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: line.ignoreCaloriesSnapshot,
          referenceAmount: line.referenceAmount,
          referenceUnit: line.referenceUnit,
          notes: line.notes?.trim() || undefined,
        }),
      ),
    );

    return { recipeId, recipeVersionId: versionId };
  },
});

export const updateRecipeCurrentVersion = mutation({
  args: {
    recipeId: v.id("recipes"),
    name: v.string(),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredientLines: v.array(recipeIngredientValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      ownerUserId,
      "Recipe not found.",
    );
    assertNonEmpty(args.name, "Recipe name");
    const resolvedLines = await resolveRecipeIngredientLines(
      ctx.db,
      ownerUserId,
      args.ingredientLines,
    );

    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));
    const current = versions.find((version) => version.isCurrent);
    if (!current) {
      throw new Error("Current recipe version not found.");
    }

    await ctx.db.patch(args.recipeId, {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
    });
    await ctx.db.patch(current._id, {
      name: args.name.trim(),
      instructions: args.instructions?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });

    const oldIngredients = await ctx.db
      .query("recipeVersionIngredients")
      .withIndex("by_recipeVersion", (q) =>
        q.eq("recipeVersionId", current._id),
      )
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));

    await Promise.all([
      ...oldIngredients.map((line) => ctx.db.delete(line._id)),
      ...resolvedLines.map((line) =>
        ctx.db.insert("recipeVersionIngredients", {
          ownerUserId,
          recipeVersionId: current._id,
          sourceType: line.sourceType,
          ingredientId: line.ingredientId,
          ingredientNameSnapshot: line.ingredientNameSnapshot,
          kcalPer100Snapshot: line.kcalPer100Snapshot,
          kcalBasisUnitSnapshot: line.kcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: line.ignoreCaloriesSnapshot,
          referenceAmount: line.referenceAmount,
          referenceUnit: line.referenceUnit,
          notes: line.notes?.trim() || undefined,
        }),
      ),
    ]);
  },
});

export const setRecipeArchived = mutation({
  args: {
    recipeId: v.id("recipes"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      ownerUserId,
      "Recipe not found.",
    );
    await ctx.db.patch(args.recipeId, { archived: args.archived });
  },
});

export const deleteRecipe = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      ownerUserId,
      "Recipe not found.",
    );
    const cookedRef = (
      await ctx.db
        .query("cookedFoods")
        .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
    ).some((item) => item.recipeId === args.recipeId);
    if (cookedRef) {
      throw new Error("Recipe has cooked history. Archive instead.");
    }

    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));
    const versionIds = new Set(versions.map((version) => version._id));
    const versionIngredients = await ctx.db
      .query("recipeVersionIngredients")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
      .collect();
    await Promise.all([
      ...versionIngredients
        .filter((line) => versionIds.has(line.recipeVersionId))
        .map((line) => ctx.db.delete(line._id)),
      ...versions.map((version) => ctx.db.delete(version._id)),
    ]);
    await ctx.db.delete(args.recipeId);
  },
});

export const createCookSession = mutation({
  args: {
    label: v.optional(v.string()),
    cookedAt: v.optional(v.number()),
    cookedByPersonId: v.optional(v.id("people")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    if (args.cookedByPersonId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.cookedByPersonId),
        ownerUserId,
        "Cook person not found.",
      );
    }

    const now = Date.now();
    return await ctx.db.insert("cookSessions", {
      ownerUserId,
      label: args.label?.trim() || undefined,
      cookedAt: args.cookedAt ?? now,
      cookedByPersonId: args.cookedByPersonId,
      notes: args.notes?.trim() || undefined,
      archived: false,
      updatedAt: now,
      createdAt: now,
    });
  },
});

export const updateCookSession = mutation({
  args: {
    sessionId: v.id("cookSessions"),
    label: v.optional(v.string()),
    cookedAt: v.optional(v.number()),
    cookedByPersonId: v.optional(v.id("people")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    const session = assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      ownerUserId,
      "Cook session not found.",
    );
    if (args.cookedByPersonId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.cookedByPersonId),
        ownerUserId,
        "Cook person not found.",
      );
    }
    await ctx.db.patch(args.sessionId, {
      label: args.label?.trim() || undefined,
      cookedAt: args.cookedAt ?? session.cookedAt,
      cookedByPersonId: args.cookedByPersonId,
      notes: args.notes?.trim() || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const setCookSessionArchived = mutation({
  args: {
    sessionId: v.id("cookSessions"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      ownerUserId,
      "Cook session not found.",
    );
    await ctx.db.patch(args.sessionId, { archived: args.archived });
  },
});

export const deleteCookSession = mutation({
  args: { sessionId: v.id("cookSessions") },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      ownerUserId,
      "Cook session not found.",
    );
    const cookedFoods = await ctx.db
      .query("cookedFoods")
      .withIndex("by_session", (q) => q.eq("cookSessionId", args.sessionId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));
    const cookedFoodIds = new Set(cookedFoods.map((food) => food._id));
    const mealRefs = await ctx.db
      .query("mealItems")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ownerUserId))
      .collect();
    if (
      mealRefs.some(
        (row) => row.cookedFoodId && cookedFoodIds.has(row.cookedFoodId),
      )
    ) {
      throw new Error(
        "One or more cooked foods are in meal history. Archive instead.",
      );
    }

    for (const food of cookedFoods) {
      await deleteCookedFoodWithChildren(ctx, ownerUserId, food._id);
    }
    await ctx.db.delete(args.sessionId);
  },
});

export const createCookedFood = mutation({
  args: {
    cookSessionId: v.id("cookSessions"),
    name: v.string(),
    recipeId: v.optional(v.id("recipes")),
    recipeVersionId: v.optional(v.id("recipeVersions")),
    saveAsRecipe: v.optional(v.boolean()),
    recipeDraft: v.optional(cookedFoodRecipeDraftValidator),
    groupIds: v.array(v.id("foodGroups")),
    finishedWeightGrams: v.number(),
    notes: v.optional(v.string()),
    ingredients: v.array(cookedFoodIngredientValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertNonEmpty(args.name, "Cooked food name");
    assertOwnedOrThrow(
      await ctx.db.get(args.cookSessionId),
      ownerUserId,
      "Cook session not found.",
    );
    if (args.saveAsRecipe && (args.recipeId || args.recipeVersionId)) {
      throw new Error(
        "Cannot select an existing recipe while saving as a new recipe.",
      );
    }
    if (!args.saveAsRecipe) {
      if (args.recipeId) {
        assertOwnedOrThrow(
          await ctx.db.get(args.recipeId),
          ownerUserId,
          "Recipe not found.",
        );
      }
      if (args.recipeVersionId) {
        assertOwnedOrThrow(
          await ctx.db.get(args.recipeVersionId),
          ownerUserId,
          "Recipe version not found.",
        );
      }
    }
    const groups = await Promise.all(
      args.groupIds.map((groupId) => ctx.db.get(groupId)),
    );
    if (groups.some((group) => !group || group.ownerUserId !== ownerUserId)) {
      throw new Error("One or more groups are missing.");
    }

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      ownerUserId,
      args.ingredients,
      args.finishedWeightGrams,
      {
        persistAllCustomIngredients: Boolean(args.saveAsRecipe),
      },
    );

    const now = Date.now();
    let linkedRecipeId = args.recipeId;
    let linkedRecipeVersionId = args.recipeVersionId;
    if (args.saveAsRecipe) {
      const recipeName = args.recipeDraft?.name?.trim() || args.name.trim();
      assertNonEmpty(recipeName, "Recipe name");
      const recipeLines = nutrition.ingredientSnapshots;

      linkedRecipeId = await ctx.db.insert("recipes", {
        ownerUserId,
        name: recipeName,
        description: args.recipeDraft?.description?.trim() || undefined,
        archived: false,
        latestVersionNumber: 1,
        createdAt: now,
      });
      linkedRecipeVersionId = await ctx.db.insert("recipeVersions", {
        ownerUserId,
        recipeId: linkedRecipeId,
        versionNumber: 1,
        name: recipeName,
        instructions: args.recipeDraft?.instructions?.trim() || undefined,
        notes: args.recipeDraft?.notes?.trim() || undefined,
        isCurrent: true,
        createdAt: now,
      });
      await Promise.all(
        recipeLines.map((line) =>
          ctx.db.insert("recipeVersionIngredients", {
            ownerUserId,
            recipeVersionId: linkedRecipeVersionId as Id<"recipeVersions">,
            sourceType: line.sourceType,
            ingredientId: line.ingredientId,
            ingredientNameSnapshot: line.ingredientNameSnapshot,
            kcalPer100Snapshot: line.ingredientKcalPer100Snapshot,
            kcalBasisUnitSnapshot: line.ingredientKcalBasisUnitSnapshot,
            ignoreCaloriesSnapshot: line.ignoreCaloriesSnapshot,
            referenceAmount: line.referenceAmount,
            referenceUnit: line.referenceUnit,
            notes: line.notes,
          }),
        ),
      );
    }

    const cookedFoodId = await ctx.db.insert("cookedFoods", {
      ownerUserId,
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: linkedRecipeId,
      recipeVersionId: linkedRecipeVersionId,
      groupIds: args.groupIds,
      finishedWeightGrams: args.finishedWeightGrams,
      totalRawWeightGrams: nutrition.totalRawWeightGrams,
      totalCalories: nutrition.totalCalories,
      kcalPer100: nutrition.kcalPer100,
      notes: args.notes?.trim() || undefined,
      archived: false,
      createdAt: now,
    });

    await Promise.all(
      nutrition.ingredientSnapshots.map((snapshot) =>
        ctx.db.insert("cookedFoodIngredients", {
          ownerUserId,
          cookedFoodId,
          sourceType: snapshot.sourceType,
          ingredientId: snapshot.ingredientId,
          ingredientNameSnapshot: snapshot.ingredientNameSnapshot,
          referenceAmount: snapshot.referenceAmount,
          referenceUnit: snapshot.referenceUnit,
          countedAmount: snapshot.countedAmount,
          rawWeightGrams:
            snapshot.countedAmount ??
            (snapshot.referenceUnit === "g"
              ? snapshot.referenceAmount
              : undefined),
          ingredientKcalPer100Snapshot: snapshot.ingredientKcalPer100Snapshot,
          ingredientKcalBasisUnitSnapshot:
            snapshot.ingredientKcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: snapshot.ignoreCaloriesSnapshot,
          ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        }),
      ),
    );

    await touchCookSession(ctx, ownerUserId, args.cookSessionId, now);
    return cookedFoodId;
  },
});

export const updateCookedFood = mutation({
  args: {
    cookedFoodId: v.id("cookedFoods"),
    cookSessionId: v.id("cookSessions"),
    name: v.string(),
    recipeId: v.optional(v.id("recipes")),
    recipeVersionId: v.optional(v.id("recipeVersions")),
    groupIds: v.array(v.id("foodGroups")),
    finishedWeightGrams: v.number(),
    notes: v.optional(v.string()),
    ingredients: v.array(cookedFoodIngredientValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    const cookedFood = assertOwnedOrThrow(
      await ctx.db.get(args.cookedFoodId),
      ownerUserId,
      "Cooked food not found.",
    );
    assertNonEmpty(args.name, "Cooked food name");
    assertOwnedOrThrow(
      await ctx.db.get(args.cookSessionId),
      ownerUserId,
      "Cook session not found.",
    );
    if (args.recipeId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.recipeId),
        ownerUserId,
        "Recipe not found.",
      );
    }
    if (args.recipeVersionId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.recipeVersionId),
        ownerUserId,
        "Recipe version not found.",
      );
    }
    const groups = await Promise.all(
      args.groupIds.map((groupId) => ctx.db.get(groupId)),
    );
    if (groups.some((group) => !group || group.ownerUserId !== ownerUserId)) {
      throw new Error("One or more groups are missing.");
    }

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      ownerUserId,
      args.ingredients,
      args.finishedWeightGrams,
    );
    const now = Date.now();
    await ctx.db.patch(args.cookedFoodId, {
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: args.recipeId,
      recipeVersionId: args.recipeVersionId,
      groupIds: args.groupIds,
      finishedWeightGrams: args.finishedWeightGrams,
      totalRawWeightGrams: nutrition.totalRawWeightGrams,
      totalCalories: nutrition.totalCalories,
      kcalPer100: nutrition.kcalPer100,
      notes: args.notes?.trim() || undefined,
    });

    const oldRows = await ctx.db
      .query("cookedFoodIngredients")
      .withIndex("by_cookedFood", (q) =>
        q.eq("cookedFoodId", args.cookedFoodId),
      )
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));
    await Promise.all(oldRows.map((row) => ctx.db.delete(row._id)));
    await Promise.all(
      nutrition.ingredientSnapshots.map((snapshot) =>
        ctx.db.insert("cookedFoodIngredients", {
          ownerUserId,
          cookedFoodId: args.cookedFoodId,
          sourceType: snapshot.sourceType,
          ingredientId: snapshot.ingredientId,
          ingredientNameSnapshot: snapshot.ingredientNameSnapshot,
          referenceAmount: snapshot.referenceAmount,
          referenceUnit: snapshot.referenceUnit,
          countedAmount: snapshot.countedAmount,
          rawWeightGrams:
            snapshot.countedAmount ??
            (snapshot.referenceUnit === "g"
              ? snapshot.referenceAmount
              : undefined),
          ingredientKcalPer100Snapshot: snapshot.ingredientKcalPer100Snapshot,
          ingredientKcalBasisUnitSnapshot:
            snapshot.ingredientKcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: snapshot.ignoreCaloriesSnapshot,
          ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        }),
      ),
    );
    await touchCookSession(ctx, ownerUserId, args.cookSessionId, now);
    if (cookedFood.cookSessionId !== args.cookSessionId) {
      await touchCookSession(ctx, ownerUserId, cookedFood.cookSessionId, now);
    }
  },
});

export const setCookedFoodArchived = mutation({
  args: {
    cookedFoodId: v.id("cookedFoods"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    const cookedFood = assertOwnedOrThrow(
      await ctx.db.get(args.cookedFoodId),
      ownerUserId,
      "Cooked food not found.",
    );
    await ctx.db.patch(args.cookedFoodId, { archived: args.archived });
    await touchCookSession(ctx, ownerUserId, cookedFood.cookSessionId);
  },
});

export const deleteCookedFood = mutation({
  args: { cookedFoodId: v.id("cookedFoods") },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    const sessionId = await deleteCookedFoodWithChildren(
      ctx,
      ownerUserId,
      args.cookedFoodId,
    );
    await touchCookSession(ctx, ownerUserId, sessionId);
  },
});

export const createMeal = mutation({
  args: {
    personId: v.id("people"),
    name: v.optional(v.string()),
    eatenOn: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(mealItemInputValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      "Person not found.",
    );
    const now = Date.now();
    const itemSnapshots = await buildMealItemSnapshots(
      ctx.db,
      ownerUserId,
      args.items,
    );
    const mealId = await ctx.db.insert("meals", {
      ownerUserId,
      personId: args.personId,
      name: args.name?.trim() || undefined,
      eatenOn: normalizeDate(args.eatenOn, now),
      notes: args.notes?.trim() || undefined,
      archived: false,
      createdAt: now,
    });
    await Promise.all(
      itemSnapshots.map((item) =>
        ctx.db.insert("mealItems", {
          ownerUserId,
          mealId,
          sourceType: item.sourceType,
          ingredientId: item.ingredientId,
          cookedFoodId: item.cookedFoodId,
          nameSnapshot: item.nameSnapshot,
          kcalPer100Snapshot: item.kcalPer100Snapshot,
          kcalBasisUnitSnapshot: item.kcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: item.ignoreCaloriesSnapshot,
          consumedWeightGrams: item.consumedWeightGrams,
          caloriesSnapshot: item.caloriesSnapshot,
          notes: item.notes,
        }),
      ),
    );
    return mealId;
  },
});

export const updateMeal = mutation({
  args: {
    mealId: v.id("meals"),
    personId: v.id("people"),
    name: v.optional(v.string()),
    eatenOn: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(mealItemInputValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.mealId),
      ownerUserId,
      "Meal not found.",
    );
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      "Person not found.",
    );
    const snapshots = await buildMealItemSnapshots(
      ctx.db,
      ownerUserId,
      args.items,
    );
    await ctx.db.patch(args.mealId, {
      personId: args.personId,
      name: args.name?.trim() || undefined,
      eatenOn: normalizeDate(args.eatenOn, Date.now()),
      notes: args.notes?.trim() || undefined,
    });
    const existingItems = await ctx.db
      .query("mealItems")
      .withIndex("by_meal", (q) => q.eq("mealId", args.mealId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));
    await Promise.all(existingItems.map((item) => ctx.db.delete(item._id)));
    await Promise.all(
      snapshots.map((item) =>
        ctx.db.insert("mealItems", {
          ownerUserId,
          mealId: args.mealId,
          sourceType: item.sourceType,
          ingredientId: item.ingredientId,
          cookedFoodId: item.cookedFoodId,
          nameSnapshot: item.nameSnapshot,
          kcalPer100Snapshot: item.kcalPer100Snapshot,
          kcalBasisUnitSnapshot: item.kcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: item.ignoreCaloriesSnapshot,
          consumedWeightGrams: item.consumedWeightGrams,
          caloriesSnapshot: item.caloriesSnapshot,
          notes: item.notes,
        }),
      ),
    );
  },
});

export const setMealArchived = mutation({
  args: {
    mealId: v.id("meals"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.mealId),
      ownerUserId,
      "Meal not found.",
    );
    await ctx.db.patch(args.mealId, { archived: args.archived });
  },
});

export const deleteMeal = mutation({
  args: { mealId: v.id("meals") },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx);
    assertOwnedOrThrow(
      await ctx.db.get(args.mealId),
      ownerUserId,
      "Meal not found.",
    );
    const items = await ctx.db
      .query("mealItems")
      .withIndex("by_meal", (q) => q.eq("mealId", args.mealId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId));
    await Promise.all(items.map((item) => ctx.db.delete(item._id)));
    await ctx.db.delete(args.mealId);
  },
});
