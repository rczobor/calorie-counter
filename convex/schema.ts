import { defineSchema, defineTable } from 'convex/server'
import {
  cookedFoodIngredientsFields,
  cookedFoodsFields,
  cookSessionsFields,
  foodGroupsFields,
  ingredientsFields,
  mealItemsFields,
  mealsFields,
  peopleFields,
  personGoalHistoryFields,
  recipesFields,
  recipeVersionIngredientsFields,
  recipeVersionsFields,
} from './validators'

export default defineSchema({
  people: defineTable(peopleFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier']),
  personGoalHistory: defineTable(personGoalHistoryFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_person_createdAt', ['personId', 'createdAt'])
    .index('by_ownerTokenIdentifier_and_personId_and_createdAt', [
      'ownerTokenIdentifier',
      'personId',
      'createdAt',
    ]),
  foodGroups: defineTable(foodGroupsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier']),
  ingredients: defineTable(ingredientsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier']),
  recipes: defineTable(recipesFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier']),
  recipeVersions: defineTable(recipeVersionsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_recipe', ['recipeId'])
    .index('by_ownerTokenIdentifier_and_recipeId', [
      'ownerTokenIdentifier',
      'recipeId',
    ]),
  recipeVersionIngredients: defineTable(recipeVersionIngredientsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_recipeVersion', ['recipeVersionId'])
    .index('by_ingredient', ['ingredientId'])
    .index('by_ownerTokenIdentifier_and_recipeVersionId', [
      'ownerTokenIdentifier',
      'recipeVersionId',
    ])
    .index('by_ownerTokenIdentifier_and_ingredientId', [
      'ownerTokenIdentifier',
      'ingredientId',
    ]),
  cookSessions: defineTable(cookSessionsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_person', ['cookedByPersonId'])
    .index('by_ownerTokenIdentifier_and_cookedByPersonId', [
      'ownerTokenIdentifier',
      'cookedByPersonId',
    ]),
  cookedFoods: defineTable(cookedFoodsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_session', ['cookSessionId'])
    .index('by_recipe', ['recipeId'])
    .index('by_ownerTokenIdentifier_and_cookSessionId', [
      'ownerTokenIdentifier',
      'cookSessionId',
    ])
    .index('by_ownerTokenIdentifier_and_recipeId', [
      'ownerTokenIdentifier',
      'recipeId',
    ]),
  cookedFoodIngredients: defineTable(cookedFoodIngredientsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_cookedFood', ['cookedFoodId'])
    .index('by_ingredient', ['ingredientId'])
    .index('by_ownerTokenIdentifier_and_cookedFoodId', [
      'ownerTokenIdentifier',
      'cookedFoodId',
    ])
    .index('by_ownerTokenIdentifier_and_ingredientId', [
      'ownerTokenIdentifier',
      'ingredientId',
    ]),
  meals: defineTable(mealsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_ownerUserId_and_eatenOn', ['ownerUserId', 'eatenOn'])
    .index('by_person_eatenOn', ['personId', 'eatenOn'])
    .index('by_ownerTokenIdentifier_and_eatenOn', [
      'ownerTokenIdentifier',
      'eatenOn',
    ])
    .index('by_ownerTokenIdentifier_and_personId_and_eatenOn', [
      'ownerTokenIdentifier',
      'personId',
      'eatenOn',
    ]),
  mealItems: defineTable(mealItemsFields)
    .index('by_owner', ['ownerUserId'])
    .index('by_ownerTokenIdentifier', ['ownerTokenIdentifier'])
    .index('by_meal', ['mealId'])
    .index('by_cookedFood', ['cookedFoodId'])
    .index('by_ingredient', ['ingredientId'])
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
})
