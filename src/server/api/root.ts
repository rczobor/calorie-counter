import { cookingRouter } from "@/server/api/routers/cookings";
import { ingredientRouter } from "@/server/api/routers/ingredients";
import { personaRouter } from "@/server/api/routers/personas";
import { recipeRouter } from "@/server/api/routers/recipes";
import { servingRouter } from "@/server/api/routers/servings";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { quickServingRouter } from "./routers/quick-servings";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  cooking: cookingRouter,
  ingredient: ingredientRouter,
  recipe: recipeRouter,
  serving: servingRouter,
  quickServing: quickServingRouter,
  persona: personaRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
