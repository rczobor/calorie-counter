import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  cookingResult,
  mealResult,
  savedFoodResult,
  savedFoodNutrition,
  loggingPreferences,
} from './mcpValidators'

import {
  cookedFoodIngredientRecordValidator,
  cookedFoodsFields,
  cookSessionsFields,
  dailySummariesFields,
  foodGroupsFields,
  ingredientsFields,
  mealItemRecordValidator,
  mealsFields,
  peopleFields,
  personGoalHistoryFields,
  recipesFields,
  recipeVersionIngredientRecordValidator,
  recipeVersionsFields,
  nutritionProvenanceValidator,
} from './validators'

export default defineSchema({
  mcpPreferences: defineTable({
    tokenIdentifier: v.string(),
    ...loggingPreferences.fields,
  }).index('by_tokenIdentifier', ['tokenIdentifier']),
  mcpSavedFoods: defineTable({
    ownerTokenIdentifier: v.string(),
    householdId: v.id('households'),
    name: v.string(),
    nutrition: savedFoodNutrition,
    nutritionProvenance: v.optional(nutritionProvenanceValidator),
    sourceMealId: v.id('meals'),
    sourceItemId: v.id('mealItems'),
    createdAt: v.number(),
    archived: v.optional(v.literal(true)),
    archivedAt: v.optional(v.number()),
  })
    .index('by_householdId_and_name', ['householdId', 'name'])
    .index('by_householdId_and_archived_and_name', [
      'householdId',
      'archived',
      'name',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['householdId', 'archived'],
    }),
  households: defineTable({
    name: v.string(),
    personalOwnerTokenIdentifier: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_personalOwnerTokenIdentifier', ['personalOwnerTokenIdentifier']),
  householdMembers: defineTable({
    householdId: v.id('households'),
    tokenIdentifier: v.string(),
    name: v.string(),
    role: v.union(v.literal('admin'), v.literal('member')),
    joinedAt: v.number(),
  })
    .index('by_tokenIdentifier_and_householdId', [
      'tokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId']),
  householdInvitations: defineTable({
    householdId: v.id('households'),
    tokenHash: v.string(),
    createdBy: v.string(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_householdId', ['householdId']),
  mcpOperations: defineTable({
    ownerTokenIdentifier: v.string(),
    householdId: v.optional(v.id('households')),
    connectionId: v.string(),
    operation: v.union(
      v.literal('meal'),
      v.literal('cooking'),
      v.literal('mealCorrection'),
      v.literal('savedFood'),
    ),
    key: v.string(),
    input: v.string(),
    result: v.union(mealResult, cookingResult, savedFoodResult),
  }).index('by_ownerTokenIdentifier_and_connectionId_and_key', [
    'ownerTokenIdentifier',
    'connectionId',
    'key',
  ]),
  people: defineTable(peopleFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_archived_and_name', [
      'householdId',
      'archived',
      'name',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['householdId', 'archived'],
    }),
  personGoalHistory: defineTable(personGoalHistoryFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_personId_and_createdAt', [
      'householdId',
      'personId',
      'createdAt',
    ])
    .index('by_householdId_and_personId_and_effectiveDate', [
      'householdId',
      'personId',
      'effectiveDate',
    ]),
  foodGroups: defineTable(foodGroupsFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_archived_and_name', [
      'householdId',
      'archived',
      'name',
    ])
    .index('by_householdId_and_archived_and_appliesTo_and_name', [
      'householdId',
      'archived',
      'appliesTo',
      'name',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['householdId', 'archived', 'appliesTo'],
    }),
  ingredients: defineTable(ingredientsFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_archived_and_name', [
      'householdId',
      'archived',
      'name',
    ])
    .index('by_householdId_and_archived_and_kcalBasisUnit_and_name', [
      'householdId',
      'archived',
      'kcalBasisUnit',
      'name',
    ])
    .index('by_householdId_and_groupId', ['householdId', 'groupId'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['householdId', 'archived', 'kcalBasisUnit'],
    }),
  recipes: defineTable(recipesFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_archived_and_name', [
      'householdId',
      'archived',
      'name',
    ])
    .index('by_householdId_and_archived', ['householdId', 'archived'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['householdId', 'archived'],
    }),
  recipeVersions: defineTable(recipeVersionsFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_recipeId', ['householdId', 'recipeId'])
    .index('by_householdId_and_recipeId_and_versionNumber', [
      'householdId',
      'recipeId',
      'versionNumber',
    ]),
  recipeVersionIngredients: defineTable(recipeVersionIngredientRecordValidator)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_recipeVersionId', [
      'householdId',
      'recipeVersionId',
    ])
    .index('by_householdId_and_ingredientId', ['householdId', 'ingredientId']),
  cookSessions: defineTable(cookSessionsFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_archived_and_label', [
      'householdId',
      'archived',
      'label',
    ])
    .index('by_householdId_and_archived_and_cookedAt', [
      'householdId',
      'archived',
      'cookedAt',
    ])
    .index('by_householdId_and_cookedByPersonId', [
      'householdId',
      'cookedByPersonId',
    ])
    .searchIndex('search_searchText', {
      searchField: 'searchText',
      filterFields: ['householdId', 'archived'],
    }),
  cookedFoods: defineTable(cookedFoodsFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_archived_and_name', [
      'householdId',
      'archived',
      'name',
    ])
    .index('by_householdId_and_archived', ['householdId', 'archived'])
    .index('by_householdId_and_cookSessionId', ['householdId', 'cookSessionId'])
    .index('by_householdId_and_cookSessionId_and_archived', [
      'householdId',
      'cookSessionId',
      'archived',
    ])
    .index('by_householdId_and_recipeId', ['householdId', 'recipeId'])
    .index('by_householdId_and_groupId', ['householdId', 'groupId'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['householdId', 'cookSessionId', 'archived'],
    }),
  cookedFoodIngredients: defineTable(cookedFoodIngredientRecordValidator)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_cookedFoodId', ['householdId', 'cookedFoodId'])
    .index('by_householdId_and_ingredientId', ['householdId', 'ingredientId']),
  meals: defineTable(mealsFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId', ['householdId'])
    .index('by_householdId_and_personId_and_eatenOn_and_name', [
      'householdId',
      'personId',
      'eatenOn',
      'name',
    ])
    .index('by_householdId_and_eatenOn', ['householdId', 'eatenOn'])
    .index('by_householdId_and_personId_and_eatenOn', [
      'householdId',
      'personId',
      'eatenOn',
    ])
    .index('by_householdId_and_personId_and_eatenOn_and_archived', [
      'householdId',
      'personId',
      'eatenOn',
      'archived',
    ]),
  mealItems: defineTable(mealItemRecordValidator)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId_and_mealId', ['householdId', 'mealId'])
    .index('by_householdId_and_cookedFoodId', ['householdId', 'cookedFoodId'])
    .index('by_householdId_and_ingredientId', ['householdId', 'ingredientId']),
  dailySummaries: defineTable(dailySummariesFields)
    .index('by_ownerTokenIdentifier_and_householdId', [
      'ownerTokenIdentifier',
      'householdId',
    ])
    .index('by_householdId_and_personId_and_eatenOn', [
      'householdId',
      'personId',
      'eatenOn',
    ])
    .index('by_householdId_and_eatenOn', ['householdId', 'eatenOn']),
})
