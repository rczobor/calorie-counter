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
  people: defineTable({
    ownerUserId: v.optional(v.string()),
    name: v.string(),
    notes: v.optional(v.string()),
    currentDailyGoalKcal: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),
  personGoalHistory: defineTable({
    ownerUserId: v.optional(v.string()),
    personId: v.id('people'),
    effectiveDate: v.string(),
    goalKcal: v.number(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_person_createdAt', ['personId', 'createdAt']),
  foodGroups: defineTable({
    ownerUserId: v.optional(v.string()),
    name: v.string(),
    slug: v.optional(v.string()),
    appliesTo: groupScopeValidator,
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),
  ingredients: defineTable({
    ownerUserId: v.optional(v.string()),
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100g: v.number(),
    defaultUnit: unitValidator,
    gramsPerUnit: v.optional(v.number()),
    groupIds: v.array(v.id('foodGroups')),
    notes: v.optional(v.string()),
    archived: v.boolean(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),
  recipes: defineTable({
    ownerUserId: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    archived: v.boolean(),
    latestVersionNumber: v.number(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),
  recipeVersions: defineTable({
    ownerUserId: v.optional(v.string()),
    recipeId: v.id('recipes'),
    versionNumber: v.number(),
    name: v.string(),
    instructions: v.optional(v.string()),
    notes: v.optional(v.string()),
    isCurrent: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_recipe', ['recipeId']),
  recipeVersionIngredients: defineTable({
    ownerUserId: v.optional(v.string()),
    recipeVersionId: v.id('recipeVersions'),
    ingredientId: v.id('ingredients'),
    plannedWeightGrams: v.number(),
    notes: v.optional(v.string()),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_recipeVersion', ['recipeVersionId'])
    .index('by_ingredient', ['ingredientId']),
  cookSessions: defineTable({
    ownerUserId: v.optional(v.string()),
    label: v.optional(v.string()),
    cookedAt: v.number(),
    cookedByPersonId: v.optional(v.id('people')),
    notes: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_person', ['cookedByPersonId']),
  cookedFoods: defineTable({
    ownerUserId: v.optional(v.string()),
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
    archived: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_session', ['cookSessionId'])
    .index('by_recipe', ['recipeId']),
  cookedFoodIngredients: defineTable({
    ownerUserId: v.optional(v.string()),
    cookedFoodId: v.id('cookedFoods'),
    ingredientId: v.id('ingredients'),
    rawWeightGrams: v.number(),
    ingredientKcalPer100gSnapshot: v.number(),
    ingredientCaloriesSnapshot: v.number(),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_cookedFood', ['cookedFoodId'])
    .index('by_ingredient', ['ingredientId']),
  meals: defineTable({
    ownerUserId: v.optional(v.string()),
    personId: v.id('people'),
    name: v.optional(v.string()),
    eatenOn: v.optional(v.string()),
    eatenAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_person_eatenOn', ['personId', 'eatenOn']),
  mealItems: defineTable({
    ownerUserId: v.optional(v.string()),
    mealId: v.id('meals'),
    sourceType: mealSourceValidator,
    ingredientId: v.optional(v.id('ingredients')),
    cookedFoodId: v.optional(v.id('cookedFoods')),
    consumedWeightGrams: v.number(),
    kcalPer100gSnapshot: v.number(),
    caloriesSnapshot: v.number(),
    notes: v.optional(v.string()),
  })
    .index('by_owner', ['ownerUserId'])
    .index('by_meal', ['mealId'])
    .index('by_cookedFood', ['cookedFoodId'])
    .index('by_ingredient', ['ingredientId']),
})
