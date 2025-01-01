// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTableCreator,
  timestamp,
  varchar,
  decimal,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

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

// Base ingredients table
export const ingredients = createTable(
  "ingredient",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }).notNull(),
    caloriesPer100g: decimal("calories_per_100g", {
      precision: 10,
      scale: 2,
    }).notNull(),
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
    quantityGrams: decimal("quantity_grams", {
      precision: 10,
      scale: 2,
    }).notNull(),
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
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipes.id),
  finalWeightGrams: decimal("final_weight_grams", {
    precision: 10,
    scale: 2,
  }).notNull(),
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
    quantityGrams: decimal("quantity_grams", {
      precision: 10,
      scale: 2,
    }).notNull(),
    // Override calories if different from original ingredient
    caloriesPer100g: decimal("calories_per_100g", { precision: 10, scale: 2 }),
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
