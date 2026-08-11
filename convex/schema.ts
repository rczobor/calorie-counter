import { defineSchema, defineTable } from 'convex/server'

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
} from './validators'

export default defineSchema({
  people: defineTable(peopleFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_archived_and_name', [
      'ownerTokenIdentifier',
      'archived',
      'name',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['ownerTokenIdentifier', 'archived'],
    }),
  personGoalHistory: defineTable(personGoalHistoryFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_personId_and_createdAt', [
      'ownerTokenIdentifier',
      'personId',
      'createdAt',
    ])
    .index('by_ownerTokenIdentifier_and_personId_and_effectiveDate', [
      'ownerTokenIdentifier',
      'personId',
      'effectiveDate',
    ]),
  foodGroups: defineTable(foodGroupsFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_archived_and_name', [
      'ownerTokenIdentifier',
      'archived',
      'name',
    ])
    .index('by_ownerTokenIdentifier_and_archived_and_appliesTo_and_name', [
      'ownerTokenIdentifier',
      'archived',
      'appliesTo',
      'name',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['ownerTokenIdentifier', 'archived', 'appliesTo'],
    }),
  ingredients: defineTable(ingredientsFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_archived_and_name', [
      'ownerTokenIdentifier',
      'archived',
      'name',
    ])
    .index('by_ownerTokenIdentifier_and_archived_and_kcalBasisUnit_and_name', [
      'ownerTokenIdentifier',
      'archived',
      'kcalBasisUnit',
      'name',
    ])
    .index('by_ownerTokenIdentifier_and_groupId', [
      'ownerTokenIdentifier',
      'groupId',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['ownerTokenIdentifier', 'archived', 'kcalBasisUnit'],
    }),
  recipes: defineTable(recipesFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_archived', [
      'ownerTokenIdentifier',
      'archived',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['ownerTokenIdentifier', 'archived'],
    }),
  recipeVersions: defineTable(recipeVersionsFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_recipeId', [
      'ownerTokenIdentifier',
      'recipeId',
    ])
    .index('by_ownerTokenIdentifier_and_recipeId_and_versionNumber', [
      'ownerTokenIdentifier',
      'recipeId',
      'versionNumber',
    ]),
  recipeVersionIngredients: defineTable(recipeVersionIngredientRecordValidator)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_recipeVersionId', [
      'ownerTokenIdentifier',
      'recipeVersionId',
    ])
    .index('by_ownerTokenIdentifier_and_ingredientId', [
      'ownerTokenIdentifier',
      'ingredientId',
    ]),
  cookSessions: defineTable(cookSessionsFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_archived_and_cookedAt', [
      'ownerTokenIdentifier',
      'archived',
      'cookedAt',
    ])
    .index('by_ownerTokenIdentifier_and_cookedByPersonId', [
      'ownerTokenIdentifier',
      'cookedByPersonId',
    ])
    .searchIndex('search_searchText', {
      searchField: 'searchText',
      filterFields: ['ownerTokenIdentifier', 'archived'],
    }),
  cookedFoods: defineTable(cookedFoodsFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_archived', [
      'ownerTokenIdentifier',
      'archived',
    ])
    .index('by_ownerTokenIdentifier_and_cookSessionId', [
      'ownerTokenIdentifier',
      'cookSessionId',
    ])
    .index('by_ownerTokenIdentifier_and_cookSessionId_and_archived', [
      'ownerTokenIdentifier',
      'cookSessionId',
      'archived',
    ])
    .index('by_ownerTokenIdentifier_and_recipeId', [
      'ownerTokenIdentifier',
      'recipeId',
    ])
    .index('by_ownerTokenIdentifier_and_groupId', [
      'ownerTokenIdentifier',
      'groupId',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['ownerTokenIdentifier', 'cookSessionId', 'archived'],
    }),
  cookedFoodIngredients: defineTable(cookedFoodIngredientRecordValidator)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_cookedFoodId', [
      'ownerTokenIdentifier',
      'cookedFoodId',
    ])
    .index('by_ownerTokenIdentifier_and_ingredientId', [
      'ownerTokenIdentifier',
      'ingredientId',
    ]),
  meals: defineTable(mealsFields)
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerTokenIdentifier_and_eatenOn', [
      'ownerTokenIdentifier',
      'eatenOn',
    ])
    .index('by_ownerTokenIdentifier_and_personId_and_eatenOn', [
      'ownerTokenIdentifier',
      'personId',
      'eatenOn',
    ])
    .index('by_ownerTokenIdentifier_and_personId_and_eatenOn_and_archived', [
      'ownerTokenIdentifier',
      'personId',
      'eatenOn',
      'archived',
    ]),
  mealItems: defineTable(mealItemRecordValidator)
    .index('by_ownerTokenIdentifier_and_mealId', [
      'ownerTokenIdentifier',
      'mealId',
    ])
    .index('by_ownerTokenIdentifier_and_cookedFoodId', [
      'ownerTokenIdentifier',
      'cookedFoodId',
    ])
    .index('by_ownerTokenIdentifier_and_ingredientId', [
      'ownerTokenIdentifier',
      'ingredientId',
    ]),
  dailySummaries: defineTable(dailySummariesFields)
    .index('by_ownerTokenIdentifier_and_personId_and_eatenOn', [
      'ownerTokenIdentifier',
      'personId',
      'eatenOn',
    ])
    .index('by_ownerTokenIdentifier_and_eatenOn', [
      'ownerTokenIdentifier',
      'eatenOn',
    ]),
})
