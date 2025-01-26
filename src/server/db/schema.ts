// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { relations, sql } from "drizzle-orm";
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
export const createTable = pgTableCreator((name) => `cc_${name}`);

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
  (table) => [index("ingredient_name_idx").on(table.name)],
);

export const ingredientRelations = relations(ingredients, ({ many }) => ({
  recipesToIngredients: many(recipesToIngredients),
}));

// Recipes table
export const recipes = createTable(
  "recipe",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }).notNull(),
    description: text("description").notNull(),
    category: recipeCategory("category").notNull(),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (table) => [index("recipe_name_idx").on(table.name)],
);

export const recipesRelations = relations(recipes, ({ many }) => ({
  recipesToIngredients: many(recipesToIngredients),
  cookedRecipes: many(cookedRecipes),
}));

// Recipe ingredients join table
export const recipesToIngredients = createTable(
  "recipe_ingredient",
  {
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    quantityGrams: integer("quantity_grams").notNull(),
  },
  (recipeIngredient) => [
    primaryKey({
      columns: [recipeIngredient.recipeId, recipeIngredient.ingredientId],
    }),
  ],
);

export const recipesToIngredientsRelations = relations(
  recipesToIngredients,
  ({ one }) => ({
    recipe: one(recipes, {
      fields: [recipesToIngredients.recipeId],
      references: [recipes.id],
    }),
    ingredient: one(ingredients, {
      fields: [recipesToIngredients.ingredientId],
      references: [ingredients.id],
    }),
  }),
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

export const cookingsRelations = relations(cookings, ({ many }) => ({
  cookedRecipes: many(cookedRecipes),
}));

// Cooked recipes table (recipes used in a cooking)
export const cookedRecipes = createTable("cooked_recipe", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  cookingId: integer("cooking_id")
    .notNull()
    .references(() => cookings.id, { onDelete: "cascade" }),
  recipeId: integer("recipe_id").references(() => recipes.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description").notNull(),
  finalWeightGrams: integer("final_weight_grams").notNull(),
});

export const cookedRecipesRelations = relations(
  cookedRecipes,
  ({ one, many }) => ({
    cooking: one(cookings, {
      fields: [cookedRecipes.cookingId],
      references: [cookings.id],
    }),
    recipe: one(recipes, {
      fields: [cookedRecipes.recipeId],
      references: [recipes.id],
    }),
    servingPortions: many(servingPortions),
    cookedRecipeIngredients: many(cookedRecipeIngredients),
  }),
);

// Cooked recipe ingredients (can override quantities and calories from original recipe)
export const cookedRecipeIngredients = createTable(
  "cooked_recipe_ingredient",
  {
    cookedRecipeId: integer("cooked_recipe_id")
      .notNull()
      .references(() => cookedRecipes.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    quantityGrams: integer("quantity_grams").notNull(),
    caloriesPer100g: integer("calories_per_100g").notNull(),
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

export const cookedRecipesToIngredientsRelations = relations(
  cookedRecipeIngredients,
  ({ one }) => ({
    ingredient: one(ingredients, {
      fields: [cookedRecipeIngredients.ingredientId],
      references: [ingredients.id],
    }),
    cookedRecipe: one(cookedRecipes, {
      fields: [cookedRecipeIngredients.cookedRecipeId],
      references: [cookedRecipes.id],
    }),
  }),
);

// Persons table to track individuals
export const personas = createTable(
  "persona",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }).notNull(),
    targetDailyCalories: integer("target_daily_calories").notNull(),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (table) => [index("persona_created_idx").on(table.id, table.createdBy)],
);

export const personaRelations = relations(personas, ({ many }) => ({
  servings: many(servings),
  quickServings: many(quickServings),
}));

// Servings table to track how many portions were created from a cooking
export const servings = createTable(
  "serving",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    cookingId: integer("cooking_id").references(() => cookings.id, {
      onDelete: "cascade",
    }),
    personaId: integer("persona_id")
      .references(() => personas.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 256 }),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("serving_persona_created_idx").on(
      table.personaId,
      table.createdBy,
      table.createdAt,
    ),
  ],
);

export const servingRelations = relations(servings, ({ one, many }) => ({
  cooking: one(cookings, {
    fields: [servings.cookingId],
    references: [cookings.id],
  }),
  persona: one(personas, {
    fields: [servings.personaId],
    references: [personas.id],
  }),
  portions: many(servingPortions),
}));

// Track which cooked recipes are included in a serving and their weights
export const servingPortions = createTable(
  "serving_portion",
  {
    servingId: integer("serving_id")
      .notNull()
      .references(() => servings.id, { onDelete: "cascade" }),
    cookedRecipeId: integer("cooked_recipe_id")
      .notNull()
      .references(() => cookedRecipes.id, { onDelete: "cascade" }),
    weightGrams: integer("weight_grams").notNull(),
  },
  (servingPortions) => [
    primaryKey({
      columns: [servingPortions.servingId, servingPortions.cookedRecipeId],
    }),
  ],
);

export const servingPortionRelations = relations(
  servingPortions,
  ({ one }) => ({
    serving: one(servings, {
      fields: [servingPortions.servingId],
      references: [servings.id],
    }),
    cookedRecipe: one(cookedRecipes, {
      fields: [servingPortions.cookedRecipeId],
      references: [cookedRecipes.id],
    }),
  }),
);

// Add direct serving without cooking/recipe/ingredient
export const quickServings = createTable(
  "quick_serving",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    personaId: integer("persona_id")
      .references(() => personas.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 256 }),
    calories: integer("calories").notNull(),
    createdBy: varchar("created_by", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("quick_serving_persona_created_idx").on(
      table.personaId,
      table.createdBy,
      table.createdAt,
    ),
  ],
);

export const quickServingRelations = relations(quickServings, ({ one }) => ({
  persona: one(personas, {
    fields: [quickServings.personaId],
    references: [personas.id],
  }),
}));

// Type exports
export type Ingredient = InferSelectModel<typeof ingredients>;
export type NewIngredient = InferInsertModel<typeof ingredients>;

export type Recipe = InferSelectModel<typeof recipes>;
export type NewRecipe = InferInsertModel<typeof recipes>;

export type RecipesToIngredient = InferSelectModel<typeof recipesToIngredients>;

export type Cooking = InferSelectModel<typeof cookings>;

export type CookedRecipe = InferSelectModel<typeof cookedRecipes>;

export type CookedRecipeIngredient = InferSelectModel<
  typeof cookedRecipeIngredients
>;

export type Persona = InferSelectModel<typeof personas>;

export type Serving = InferSelectModel<typeof servings>;

export type ServingPortion = InferSelectModel<typeof servingPortions>;
export type ServingPortionWithRelations = ServingPortion & {
  cookedRecipe: CookedRecipe & {
    cookedRecipeIngredients: (CookedRecipeIngredient & {
      ingredient: Ingredient;
    })[];
  };
};

export type QuickServing = InferSelectModel<typeof quickServings>;
