import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const unitValidator = v.union(
  v.literal('g'),
  v.literal('ml'),
  v.literal('piece'),
)

const groupScopeValidator = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
  v.literal('both'),
)

const mealSourceValidator = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
)

export default defineSchema({
  products: defineTable({
    title: v.string(),
    imageId: v.string(),
    price: v.number(),
  }),
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
  }),
  people: defineTable({
    name: v.string(),
    notes: v.optional(v.string()),
    currentDailyGoalKcal: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_createdAt', ['createdAt']),
  personGoalHistory: defineTable({
    personId: v.id('people'),
    effectiveDate: v.string(),
    goalKcal: v.number(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_person_effectiveDate', ['personId', 'effectiveDate'])
    .index('by_person_createdAt', ['personId', 'createdAt']),
  foodGroups: defineTable({
    name: v.string(),
    slug: v.string(),
    appliesTo: groupScopeValidator,
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_createdAt', ['createdAt']),
  ingredients: defineTable({
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100g: v.number(),
    defaultUnit: unitValidator,
    gramsPerUnit: v.optional(v.number()),
    groupIds: v.array(v.id('foodGroups')),
    notes: v.optional(v.string()),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_createdAt', ['createdAt']),
  recipes: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    archived: v.boolean(),
    latestVersionNumber: v.number(),
    createdAt: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_createdAt', ['createdAt']),
  recipeVersions: defineTable({
    recipeId: v.id('recipes'),
    versionNumber: v.number(),
    name: v.string(),
    instructions: v.optional(v.string()),
    notes: v.optional(v.string()),
    isCurrent: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_recipe', ['recipeId'])
    .index('by_recipe_version', ['recipeId', 'versionNumber']),
  recipeVersionIngredients: defineTable({
    recipeVersionId: v.id('recipeVersions'),
    ingredientId: v.id('ingredients'),
    plannedWeightGrams: v.number(),
    notes: v.optional(v.string()),
  }).index('by_recipeVersion', ['recipeVersionId']),
  recipeVersionOutputs: defineTable({
    recipeVersionId: v.id('recipeVersions'),
    name: v.string(),
    groupIds: v.array(v.id('foodGroups')),
    plannedFinishedWeightGrams: v.optional(v.number()),
    sortOrder: v.number(),
  }).index('by_recipeVersion', ['recipeVersionId']),
  cookSessions: defineTable({
    label: v.optional(v.string()),
    cookedAt: v.number(),
    cookedByPersonId: v.optional(v.id('people')),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_cookedAt', ['cookedAt'])
    .index('by_createdAt', ['createdAt']),
  cookedFoods: defineTable({
    cookSessionId: v.id('cookSessions'),
    name: v.string(),
    recipeId: v.optional(v.id('recipes')),
    recipeVersionId: v.optional(v.id('recipeVersions')),
    groupIds: v.array(v.id('foodGroups')),
    finishedWeightGrams: v.number(),
    totalRawWeightGrams: v.number(),
    totalCalories: v.number(),
    kcalPer100g: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_session', ['cookSessionId'])
    .index('by_createdAt', ['createdAt']),
  cookedFoodIngredients: defineTable({
    cookedFoodId: v.id('cookedFoods'),
    ingredientId: v.id('ingredients'),
    rawWeightGrams: v.number(),
    ingredientKcalPer100gSnapshot: v.number(),
    ingredientCaloriesSnapshot: v.number(),
  }).index('by_cookedFood', ['cookedFoodId']),
  meals: defineTable({
    personId: v.id('people'),
    name: v.optional(v.string()),
    eatenAt: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_person_eatenAt', ['personId', 'eatenAt'])
    .index('by_createdAt', ['createdAt']),
  mealItems: defineTable({
    mealId: v.id('meals'),
    sourceType: mealSourceValidator,
    ingredientId: v.optional(v.id('ingredients')),
    cookedFoodId: v.optional(v.id('cookedFoods')),
    consumedWeightGrams: v.number(),
    kcalPer100gSnapshot: v.number(),
    caloriesSnapshot: v.number(),
    notes: v.optional(v.string()),
  }).index('by_meal', ['mealId']),
})
