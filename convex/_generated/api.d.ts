/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as catalog from "../catalog.js";
import type * as cooking from "../cooking.js";
import type * as history from "../history.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_dayNutrition from "../lib/dayNutrition.js";
import type * as lib_validation from "../lib/validation.js";
import type * as mcp from "../mcp.js";
import type * as mcpContext from "../mcpContext.js";
import type * as mcpFoodReuse from "../mcpFoodReuse.js";
import type * as mcpMealCorrections from "../mcpMealCorrections.js";
import type * as mcpOperations from "../mcpOperations.js";
import type * as mcpPreferences from "../mcpPreferences.js";
import type * as mcpValidators from "../mcpValidators.js";
import type * as meals from "../meals.js";
import type * as nutrition from "../nutrition.js";
import type * as people from "../people.js";
import type * as recipes from "../recipes.js";
import type * as savedFoods from "../savedFoods.js";
import type * as seed from "../seed.js";
import type * as validators from "../validators.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  catalog: typeof catalog;
  cooking: typeof cooking;
  history: typeof history;
  households: typeof households;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/dayNutrition": typeof lib_dayNutrition;
  "lib/validation": typeof lib_validation;
  mcp: typeof mcp;
  mcpContext: typeof mcpContext;
  mcpFoodReuse: typeof mcpFoodReuse;
  mcpMealCorrections: typeof mcpMealCorrections;
  mcpOperations: typeof mcpOperations;
  mcpPreferences: typeof mcpPreferences;
  mcpValidators: typeof mcpValidators;
  meals: typeof meals;
  nutrition: typeof nutrition;
  people: typeof people;
  recipes: typeof recipes;
  savedFoods: typeof savedFoods;
  seed: typeof seed;
  validators: typeof validators;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  mcp: import("@convex-dev/mcp/_generated/component.js").ComponentApi<"mcp">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
