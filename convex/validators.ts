import { v } from 'convex/values'

export const nutritionUnitValidator = v.union(
  v.literal('pinch'),
  v.literal('teaspoon'),
  v.literal('tablespoon'),
  v.literal('piece'),
  v.literal('g'),
  v.literal('ml'),
)

export const groupScopeValidator = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
)

export const mealSourceValidator = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
  v.literal('custom'),
)

const ownerFields = {
  ownerUserId: v.optional(v.string()),
  ownerTokenIdentifier: v.string(),
}

export const peopleFields = {
  ...ownerFields,
  name: v.string(),
  notes: v.optional(v.string()),
  currentDailyGoalKcal: v.number(),
  active: v.boolean(),
  createdAt: v.number(),
}

export const personGoalHistoryFields = {
  ...ownerFields,
  personId: v.id('people'),
  effectiveDate: v.string(),
  goalKcal: v.number(),
  reason: v.optional(v.string()),
  createdAt: v.number(),
}

export const foodGroupsFields = {
  ...ownerFields,
  name: v.string(),
  appliesTo: groupScopeValidator,
  archived: v.boolean(),
  createdAt: v.number(),
}

export const ingredientsFields = {
  ...ownerFields,
  name: v.string(),
  brand: v.optional(v.string()),
  kcalPer100: v.number(),
  kcalBasisUnit: v.optional(nutritionUnitValidator),
  ignoreCalories: v.boolean(),
  groupIds: v.array(v.id('foodGroups')),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  createdAt: v.number(),
}

export const recipesFields = {
  ...ownerFields,
  name: v.string(),
  description: v.optional(v.string()),
  archived: v.boolean(),
  latestVersionNumber: v.number(),
  createdAt: v.number(),
}

export const recipeVersionsFields = {
  ...ownerFields,
  recipeId: v.id('recipes'),
  versionNumber: v.number(),
  name: v.string(),
  instructions: v.optional(v.string()),
  notes: v.optional(v.string()),
  isCurrent: v.boolean(),
  createdAt: v.number(),
}

export const recipeVersionIngredientsFields = {
  ...ownerFields,
  recipeVersionId: v.id('recipeVersions'),
  sourceType: v.union(v.literal('ingredient'), v.literal('custom')),
  ingredientId: v.optional(v.id('ingredients')),
  ingredientNameSnapshot: v.optional(v.string()),
  kcalPer100Snapshot: v.optional(v.number()),
  kcalBasisUnitSnapshot: v.optional(nutritionUnitValidator),
  ignoreCaloriesSnapshot: v.optional(v.boolean()),
  referenceAmount: v.number(),
  referenceUnit: nutritionUnitValidator,
  notes: v.optional(v.string()),
}

export const cookSessionsFields = {
  ...ownerFields,
  label: v.optional(v.string()),
  cookedAt: v.number(),
  cookedByPersonId: v.optional(v.id('people')),
  notes: v.optional(v.string()),
  archived: v.optional(v.boolean()),
  updatedAt: v.optional(v.number()),
  createdAt: v.number(),
}

export const cookedFoodsFields = {
  ...ownerFields,
  cookSessionId: v.id('cookSessions'),
  name: v.string(),
  recipeId: v.optional(v.id('recipes')),
  recipeVersionId: v.optional(v.id('recipeVersions')),
  groupIds: v.array(v.id('foodGroups')),
  finishedWeightGrams: v.number(),
  totalRawWeightGrams: v.number(),
  totalCalories: v.number(),
  kcalPer100: v.optional(v.number()),
  notes: v.optional(v.string()),
  archived: v.optional(v.boolean()),
  createdAt: v.number(),
}

export const cookedFoodIngredientsFields = {
  ...ownerFields,
  cookedFoodId: v.id('cookedFoods'),
  sourceType: v.union(v.literal('ingredient'), v.literal('custom')),
  ingredientId: v.optional(v.id('ingredients')),
  ingredientNameSnapshot: v.optional(v.string()),
  referenceAmount: v.number(),
  referenceUnit: nutritionUnitValidator,
  countedAmount: v.optional(v.number()),
  rawWeightGrams: v.optional(v.number()),
  ingredientKcalPer100Snapshot: v.optional(v.number()),
  ingredientKcalBasisUnitSnapshot: v.optional(nutritionUnitValidator),
  ignoreCaloriesSnapshot: v.optional(v.boolean()),
  ingredientCaloriesSnapshot: v.number(),
}

export const mealsFields = {
  ...ownerFields,
  personId: v.id('people'),
  name: v.optional(v.string()),
  eatenOn: v.string(),
  notes: v.optional(v.string()),
  archived: v.optional(v.boolean()),
  createdAt: v.number(),
}

export const mealItemsFields = {
  ...ownerFields,
  mealId: v.id('meals'),
  sourceType: mealSourceValidator,
  ingredientId: v.optional(v.id('ingredients')),
  cookedFoodId: v.optional(v.id('cookedFoods')),
  nameSnapshot: v.optional(v.string()),
  kcalPer100Snapshot: v.optional(v.number()),
  kcalBasisUnitSnapshot: v.optional(nutritionUnitValidator),
  ignoreCaloriesSnapshot: v.optional(v.boolean()),
  consumedWeightGrams: v.number(),
  caloriesSnapshot: v.number(),
  notes: v.optional(v.string()),
}

export const personValidator = v.object({
  _id: v.id('people'),
  _creationTime: v.number(),
  ...peopleFields,
})

export const personGoalHistoryValidator = v.object({
  _id: v.id('personGoalHistory'),
  _creationTime: v.number(),
  ...personGoalHistoryFields,
})

export const foodGroupValidator = v.object({
  _id: v.id('foodGroups'),
  _creationTime: v.number(),
  ...foodGroupsFields,
})

export const ingredientValidator = v.object({
  _id: v.id('ingredients'),
  _creationTime: v.number(),
  ...ingredientsFields,
})

export const recipeValidator = v.object({
  _id: v.id('recipes'),
  _creationTime: v.number(),
  ...recipesFields,
})

export const recipeVersionValidator = v.object({
  _id: v.id('recipeVersions'),
  _creationTime: v.number(),
  ...recipeVersionsFields,
})

export const recipeVersionIngredientValidator = v.object({
  _id: v.id('recipeVersionIngredients'),
  _creationTime: v.number(),
  ...recipeVersionIngredientsFields,
})

export const cookSessionValidator = v.object({
  _id: v.id('cookSessions'),
  _creationTime: v.number(),
  ...cookSessionsFields,
})

export const cookedFoodValidator = v.object({
  _id: v.id('cookedFoods'),
  _creationTime: v.number(),
  ...cookedFoodsFields,
})

export const cookedFoodIngredientValidator = v.object({
  _id: v.id('cookedFoodIngredients'),
  _creationTime: v.number(),
  ...cookedFoodIngredientsFields,
})

export const mealValidator = v.object({
  _id: v.id('meals'),
  _creationTime: v.number(),
  ...mealsFields,
})

export const mealItemValidator = v.object({
  _id: v.id('mealItems'),
  _creationTime: v.number(),
  ...mealItemsFields,
})
