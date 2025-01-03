// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTableCreator,
  timestamp,
  varchar,
  primaryKey,
  text,
  pgEnum,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `calorie-counter_${name}`);

export const posts = createTable(
  "post",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (example) => [index("name_idx").on(example.name)],
);

export const ingredientCategories = [
  "Baking & Cooking Ingredients",
  "Canned & Packaged Foods",
  "Dairy",
  "Drinks & Liquids",
  "Fruit",
  "Meat",
  "Nuts & Seeds",
  "Oat & Muesli",
  "Oils & Fats",
  "Pasta & Rice",
  "Spices & Herbs",
  "Sweets & Snackies",
  "Vegetable",
  "Other",
] as const;

export const ingredientCategory = pgEnum(
  "ingredient_category",
  ingredientCategories,
);

export const recipeCategories = [
  "Dessert",
  "Main Dish",
  "Salad",
  "Side",
  "Snack",
  "Soup",
  "Other",
] as const;

export const recipeCategory = pgEnum("recipe_category", recipeCategories);

// Base ingredients table
export const ingredients = createTable(
  "ingredient",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }).notNull(),
    caloriesPer100g: integer("calories_per_100g").notNull(),
    category: ingredientCategory("category").notNull(),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (ingredient) => [index("ingredient_name_idx").on(ingredient.name)],
);

// Recipes table
export const recipes = createTable(
  "recipe",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }).notNull(),
    description: text("description"),
    category: recipeCategory("category").notNull(),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (recipe) => [index("recipe_name_idx").on(recipe.name)],
);

// Recipe ingredients junction table
export const recipeIngredients = createTable(
  "recipe_ingredient",
  {
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    quantityGrams: integer("quantity_grams").notNull(),
  },
  (recipeIngredient) => [
    primaryKey({
      columns: [recipeIngredient.recipeId, recipeIngredient.ingredientId],
    }),
  ],
);

// Cookings table
export const cookings = createTable("cooking", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 256 }).notNull(),
  createdBy: varchar("created_by", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
    () => new Date(),
  ),
});

// Cooked recipes table (recipes used in a cooking)
export const cookedRecipes = createTable("cooked_recipe", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  cookingId: integer("cooking_id")
    .notNull()
    .references(() => cookings.id),
  recipeId: integer("recipe_id").references(() => recipes.id),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  finalWeightGrams: integer("final_weight_grams").notNull(),
});

// Cooked recipe ingredients (can override quantities and calories from original recipe)
export const cookedRecipeIngredients = createTable(
  "cooked_recipe_ingredient",
  {
    cookedRecipeId: integer("cooked_recipe_id")
      .notNull()
      .references(() => cookedRecipes.id),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    quantityGrams: integer("quantity_grams").notNull(),
    // Override calories if different from original ingredient
    caloriesPer100g: integer("calories_per_100g"),
  },
  (cookedRecipeIngredient) => [
    primaryKey({
      columns: [
        cookedRecipeIngredient.cookedRecipeId,
        cookedRecipeIngredient.ingredientId,
      ],
    }),
  ],
);

// Persons table to track individuals
export const persons = createTable(
  "person",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }).notNull(),
    targetDailyCalories: integer("target_daily_calories"),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (person) => [index("person_name_idx").on(person.name)],
);

// Servings table to track how many portions were created from a cooking
export const servings = createTable("serving", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  cookingId: integer("cooking_id").references(() => cookings.id),
  name: varchar("name", { length: 256 }),
  numberOfServings: integer("number_of_servings").notNull(),
  createdBy: varchar("created_by", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Track which cooked recipes are included in a serving and their weights
export const servingPortions = createTable(
  "serving_portion",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    servingId: integer("serving_id")
      .notNull()
      .references(() => servings.id),
    cookedRecipeId: integer("cooked_recipe_id")
      .notNull()
      .references(() => cookedRecipes.id),
    weightGrams: integer("weight_grams").notNull(),
  },
  (servingPortion) => [
    index("serving_portion_serving_idx").on(servingPortion.servingId),
  ],
);

// Track consumption of servings by persons
export const consumptions = createTable(
  "consumption",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id),
    servingId: integer("serving_id")
      .notNull()
      .references(() => servings.id),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    notes: text("notes"),
  },
  (consumption) => [
    index("consumption_person_date_idx").on(
      consumption.personId,
      consumption.consumedAt,
    ),
  ],
);

// Add direct ingredients to servings (for cases without cooking/recipe)
export const servingIngredients = createTable(
  "serving_ingredient",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    servingId: integer("serving_id")
      .notNull()
      .references(() => servings.id),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    weightGrams: integer("weight_grams").notNull(),
    // Override calories if different from original ingredient
    caloriesPer100g: integer("calories_per_100g"),
  },
  (servingIngredient) => [
    index("serving_ingredient_serving_idx").on(servingIngredient.servingId),
  ],
);

// Type exports
export type Ingredient = InferSelectModel<typeof ingredients>;
export type NewIngredient = InferInsertModel<typeof ingredients>;

export type Recipe = InferSelectModel<typeof recipes>;
export type NewRecipe = InferInsertModel<typeof recipes>;

export type RecipeIngredient = InferSelectModel<typeof recipeIngredients>;
export type NewRecipeIngredient = InferInsertModel<typeof recipeIngredients>;

export type Cooking = InferSelectModel<typeof cookings>;
export type NewCooking = InferInsertModel<typeof cookings>;

export type CookedRecipe = InferSelectModel<typeof cookedRecipes>;
export type NewCookedRecipe = InferInsertModel<typeof cookedRecipes>;

export type CookedRecipeIngredient = InferSelectModel<
  typeof cookedRecipeIngredients
>;
export type NewCookedRecipeIngredient = InferInsertModel<
  typeof cookedRecipeIngredients
>;

export type Person = InferSelectModel<typeof persons>;
export type NewPerson = InferInsertModel<typeof persons>;

export type Serving = InferSelectModel<typeof servings>;
export type NewServing = InferInsertModel<typeof servings>;

export type ServingPortion = InferSelectModel<typeof servingPortions>;
export type NewServingPortion = InferInsertModel<typeof servingPortions>;

export type Consumption = InferSelectModel<typeof consumptions>;
export type NewConsumption = InferInsertModel<typeof consumptions>;

export type ServingIngredient = InferSelectModel<typeof servingIngredients>;
export type NewServingIngredient = InferInsertModel<typeof servingIngredients>;
