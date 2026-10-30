import { v } from 'convex/values'
import {
  expectedNutritionSnapshotValidator,
  nutritionProvenanceValidator,
  nutritionUnitValidator,
} from './validators'

const notes = {
  notes: v.optional(v.string()),
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
}
const weighted = { consumedWeightGrams: v.number(), ...notes }
export const mcpMealItem = v.union(
  v.object({
    sourceType: v.literal('ingredient'),
    ingredientId: v.id('ingredients'),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    ...weighted,
  }),
  v.object({
    sourceType: v.literal('cookedFood'),
    cookedFoodId: v.id('cookedFoods'),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    ...weighted,
  }),
  v.object({
    sourceType: v.literal('customByWeight'),
    name: v.string(),
    kcalPer100: v.number(),
    ignoreCalories: v.boolean(),
    ...weighted,
  }),
  v.object({
    sourceType: v.literal('fixedCalories'),
    name: v.string(),
    calories: v.number(),
    ...notes,
  }),
)
export const mealInput = v.object({
  personId: v.id('people'),
  eatenOn: v.string(),
  name: v.optional(v.string()),
  notes: v.optional(v.string()),
  items: v.array(mcpMealItem),
})

const cookingAmount = {
  referenceAmount: v.number(),
  referenceUnit: nutritionUnitValidator,
  countedAmount: v.optional(v.number()),
  ...notes,
}
export const mcpCookingIngredient = v.union(
  v.object({
    sourceType: v.literal('ingredient'),
    ingredientId: v.id('ingredients'),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    ...cookingAmount,
  }),
  v.object({
    sourceType: v.literal('custom'),
    name: v.string(),
    kcalPer100: v.number(),
    kcalBasisUnit: nutritionUnitValidator,
    ignoreCalories: v.boolean(),
    ...cookingAmount,
  }),
)
export const cookingOutput = v.object({
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  name: v.string(),
  recipeVersionId: v.optional(v.id('recipeVersions')),
  finishedWeightGrams: v.number(),
  notes: v.optional(v.string()),
  ingredients: v.array(mcpCookingIngredient),
})
export const cookingInput = v.object({
  session: v.union(
    v.object({ sessionId: v.id('cookSessions') }),
    v.object({
      label: v.optional(v.string()),
      cookedAt: v.number(),
      cookedOn: v.string(),
      cookedByPersonId: v.optional(v.id('people')),
      notes: v.optional(v.string()),
    }),
  ),
  outputs: v.array(cookingOutput),
})

export const mealPreview = v.object({
  input: mealInput,
  totalCalories: v.number(),
  items: v.array(
    v.object({
      name: v.string(),
      calories: v.number(),
      nutritionProvenance: v.optional(nutritionProvenanceValidator),
    }),
  ),
})
export const cookingPreview = v.object({
  input: cookingInput,
  outputs: v.array(
    v.object({
      name: v.string(),
      totalCalories: v.number(),
      kcalPer100: v.number(),
      finishedWeightGrams: v.number(),
      nutritionProvenance: v.optional(nutritionProvenanceValidator),
    }),
  ),
})
export const mealResult = v.object({
  url: v.optional(v.string()),
  mealId: v.id('meals'),
  personId: v.id('people'),
  eatenOn: v.string(),
  totalCalories: v.number(),
  path: v.string(),
})
export const cookingResult = v.object({
  url: v.optional(v.string()),
  sessionId: v.id('cookSessions'),
  foods: v.array(
    v.object({
      id: v.id('cookedFoods'),
      name: v.string(),
      totalCalories: v.number(),
      kcalPer100: v.number(),
    }),
  ),
  path: v.string(),
})

const correctionProvenance = {
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
}
export const mealCorrectionInput = v.object({
  mealId: v.id('meals'),
  expectedEditRevision: v.number(),
  personId: v.optional(v.id('people')),
  eatenOn: v.optional(v.string()),
  name: v.optional(v.string()),
  itemChanges: v.array(
    v.union(
      v.object({
        kind: v.literal('portion'),
        itemId: v.id('mealItems'),
        consumedWeightGrams: v.number(),
        ...correctionProvenance,
      }),
      v.object({
        kind: v.literal('fixedCalories'),
        itemId: v.id('mealItems'),
        name: v.optional(v.string()),
        calories: v.number(),
        ...correctionProvenance,
      }),
      v.object({
        kind: v.literal('customNutrition'),
        itemId: v.id('mealItems'),
        name: v.optional(v.string()),
        kcalPer100: v.number(),
        consumedWeightGrams: v.optional(v.number()),
        ...correctionProvenance,
      }),
    ),
  ),
})

export const mealCorrectionItem = v.object({
  id: v.id('mealItems'),
  name: v.string(),
  sourceType: v.union(
    v.literal('ingredient'),
    v.literal('cookedFood'),
    v.literal('customByWeight'),
    v.literal('fixedCalories'),
  ),
  consumedWeightGrams: v.optional(v.number()),
  kcalPer100: v.optional(v.number()),
  calories: v.number(),
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
})
const mealCorrectionSummary = {
  personId: v.id('people'),
  person: v.string(),
  eatenOn: v.string(),
  name: v.optional(v.string()),
  totalCalories: v.number(),
  items: v.array(mealCorrectionItem),
}
export const mealDetails = v.object({
  mealId: v.id('meals'),
  editRevision: v.number(),
  ...mealCorrectionSummary,
})
export const mealCorrectionPreview = v.object({
  input: mealCorrectionInput,
  before: v.object(mealCorrectionSummary),
  after: v.object(mealCorrectionSummary),
})

export const foodKind = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
  v.literal('recipe'),
)
export const foodCandidate = v.object({
  brand: v.optional(v.string()),
  kind: foodKind,
  id: v.string(),
  name: v.string(),
  kcalPer100: v.optional(v.number()),
  kcalBasisUnit: v.optional(nutritionUnitValidator),
  cookedAt: v.optional(v.number()),
  sessionId: v.optional(v.id('cookSessions')),
  versionId: v.optional(v.id('recipeVersions')),
})
export const foodDetails = v.object({
  food: foodCandidate,
  finishedWeightGrams: v.optional(v.number()),
  totalCalories: v.optional(v.number()),
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  ingredients: v.array(
    v.object({
      ingredientId: v.optional(v.id('ingredients')),
      name: v.string(),
      amount: v.number(),
      unit: nutritionUnitValidator,
      countedAmount: v.optional(v.number()),
      kcalPer100: v.number(),
      kcalBasisUnit: nutritionUnitValidator,
      ignoreCalories: v.boolean(),
      nutritionProvenance: v.optional(nutritionProvenanceValidator),
    }),
  ),
})

export const loggingContextResult = v.object({
  people: v.array(v.object({ id: v.id('people'), name: v.string() })),
  cursor: v.union(v.string(), v.null()),
  localDate: v.union(v.string(), v.null()),
})

export const searchResult = v.object({
  foods: v.array(foodCandidate),
  cursor: v.union(v.string(), v.null()),
})

export const dayResult = v.object({
  person: v.string(),
  eatenOn: v.string(),
  consumedCalories: v.number(),
  goalKcal: v.number(),
  mealCount: v.number(),
  meals: v.array(
    v.object({
      id: v.id('meals'),
      name: v.optional(v.string()),
      calories: v.number(),
      itemCount: v.number(),
    }),
  ),
  cursor: v.union(v.string(), v.null()),
})
