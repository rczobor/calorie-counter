import { v } from 'convex/values'
import {
  expectedNutritionSnapshotValidator,
  nutritionProvenanceValidator,
  nutritionUnitValidator,
  mealEvidenceFields,
  foodIdentityValidator,
  historicalMealItemInput,
} from './validators'

const notes = {
  ...mealEvidenceFields,
  notes: v.optional(v.string()),
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
}
const weighted = { consumedWeightGrams: v.number(), ...notes }
export const savedFoodNutrition = v.union(
  v.object({
    kind: v.literal('byVolume'),
    kcalPer100: v.number(),
    ignoreCalories: v.boolean(),
  }),
  v.object({
    kind: v.literal('byWeight'),
    kcalPer100: v.number(),
    ignoreCalories: v.boolean(),
  }),
  v.object({ kind: v.literal('fixedCalories'), calories: v.number() }),
)
export const savedFoodSnapshot = v.object({
  foodIdentity: v.optional(foodIdentityValidator),
  name: v.string(),
  nutrition: savedFoodNutrition,
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
})
export const savedFoodResult = v.object({
  foodId: v.id('mcpSavedFoods'),
  name: v.string(),
  householdId: v.id('households'),
})
export const loggingPreferences = v.object({
  householdId: v.id('households'),
  personId: v.id('people'),
  timeZone: v.string(),
  confirmationMode: v.union(v.literal('always'), v.literal('explicitOnly')),
})
export const loggingContext = v.object({
  householdId: v.id('households'),
  household: v.string(),
  defaultPersonId: v.optional(v.id('people')),
  defaultPerson: v.optional(v.string()),
  timeZone: v.optional(v.string()),
  confirmationMode: v.union(v.literal('always'), v.literal('explicitOnly')),
  requiresPersonSelection: v.boolean(),
})
export const dailySummary = v.object({
  personId: v.id('people'),
  person: v.string(),
  eatenOn: v.string(),
  consumedCalories: v.number(),
  goalKcal: v.number(),
  mealCount: v.number(),
  remainingCalories: v.number(),
  capturedAt: v.number(),
})
export const mcpMealItem = v.union(
  historicalMealItemInput,
  v.object({
    sourceType: v.literal('savedFood'),
    savedFoodId: v.id('mcpSavedFoods'),
    portion: v.union(
      v.object({ grams: v.number() }),
      v.object({ ml: v.number() }),
      v.object({ servings: v.number() }),
    ),
    expectedSnapshot: v.optional(savedFoodSnapshot),
    ...notes,
  }),
  v.object({
    sourceType: v.literal('ingredient'),
    ingredientId: v.id('ingredients'),
    expectedEditRevision: v.optional(v.number()),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    ...weighted,
  }),
  v.object({
    sourceType: v.literal('cookedFood'),
    cookedFoodId: v.id('cookedFoods'),
    expectedEditRevision: v.optional(v.number()),
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
    sourceType: v.literal('cookedFood'),
    cookedFoodId: v.id('cookedFoods'),
    consumedWeightGrams: v.number(),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    expectedEditRevision: v.optional(v.number()),
    ...notes,
  }),
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
  context: v.optional(loggingContext),
  dailySummary: v.optional(dailySummary),
  projectedDailySummary: v.optional(dailySummary),
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
  context: v.optional(loggingContext),
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
  context: v.optional(loggingContext),
  dailySummary: v.optional(dailySummary),
  affectedDailySummaries: v.optional(v.array(dailySummary)),
  url: v.optional(v.string()),
  mealId: v.id('meals'),
  personId: v.id('people'),
  eatenOn: v.string(),
  totalCalories: v.number(),
  path: v.string(),
})
export const cookingResult = v.object({
  context: v.optional(loggingContext),
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
  ...mealEvidenceFields,
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
  context: v.optional(loggingContext),
  mealId: v.id('meals'),
  editRevision: v.number(),
  ...mealCorrectionSummary,
})
export const mealCorrectionPreview = v.object({
  context: v.optional(loggingContext),
  dailySummaries: v.optional(
    v.array(v.object({ before: dailySummary, after: dailySummary })),
  ),
  input: mealCorrectionInput,
  before: v.object(mealCorrectionSummary),
  after: v.object(mealCorrectionSummary),
})

export const foodKind = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
  v.literal('recipe'),
  v.literal('savedFood'),
)
export const foodCandidate = v.object({
  foodIdentity: v.optional(foodIdentityValidator),
  brand: v.optional(v.string()),
  kind: foodKind,
  id: v.string(),
  name: v.string(),
  kcalPer100: v.optional(v.number()),
  kcalBasisUnit: v.optional(nutritionUnitValidator),
  cookedAt: v.optional(v.number()),
  sessionId: v.optional(v.id('cookSessions')),
  versionId: v.optional(v.id('recipeVersions')),
  nutrition: v.optional(savedFoodNutrition),
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
})
export const foodDetails = v.object({
  context: v.optional(loggingContext),
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
  context: v.optional(loggingContext),
  people: v.array(v.object({ id: v.id('people'), name: v.string() })),
  cursor: v.union(v.string(), v.null()),
  localDate: v.union(v.string(), v.null()),
})

export const searchResult = v.object({
  context: v.optional(loggingContext),
  foods: v.array(foodCandidate),
  cursor: v.union(v.string(), v.null()),
})

export const dayResult = v.object({
  context: v.optional(loggingContext),
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

export const repeatMealInput = v.object({
  mealId: v.id('meals'),
  personId: v.id('people'),
  eatenOn: v.string(),
  name: v.optional(v.string()),
  // Omit selections to repeat all items; supply only selected IDs to remove others.
  selections: v.optional(
    v.array(v.object({ itemId: v.id('mealItems'), multiplier: v.number() })),
  ),
  additions: v.optional(v.array(mcpMealItem)),
})

export const mealHistoryEntry = v.object({
  kind: v.union(v.literal('meal'), v.literal('mealItem')),
  mealId: v.id('meals'),
  personId: v.id('people'),
  eatenOn: v.string(),
  name: v.optional(v.string()),
  totalCalories: v.number(),
  items: v.array(mealCorrectionItem),
})
export const mealHistoryResult = v.object({
  matches: v.array(mealHistoryEntry),
  cursor: v.union(v.string(), v.null()),
})

export const templateDto = v.object({
  _id: v.id('mealTemplates'),
  _creationTime: v.number(),
  name: v.string(),
  sourceMealId: v.id('meals'),
  sourceItemIds: v.array(v.id('mealItems')),
  ingredientIds: v.array(v.id('ingredients')),
  cookedFoodIds: v.array(v.id('cookedFoods')),
  savedFoodIds: v.array(v.id('mcpSavedFoods')),
  items: v.array(mcpMealItem),
  editRevision: v.number(),
  createdAt: v.number(),
})
export const templateResult = v.object({
  templateId: v.id('mealTemplates'),
  name: v.string(),
  deleted: v.boolean(),
})
export const templateSearchResult = v.object({
  templates: v.array(templateDto),
  cursor: v.union(v.string(), v.null()),
})
export const templateChange = v.union(
  v.object({
    action: v.literal('save'),
    mealId: v.id('meals'),
    name: v.string(),
  }),
  v.object({
    action: v.literal('edit'),
    templateId: v.id('mealTemplates'),
    expectedEditRevision: v.number(),
    name: v.optional(v.string()),
    items: v.optional(v.array(mcpMealItem)),
  }),
  v.object({
    action: v.literal('delete'),
    templateId: v.id('mealTemplates'),
    expectedEditRevision: v.number(),
  }),
)

export const discoveryResult = v.object({
  householdId: v.id('households'),
  foods: v.array(foodCandidate),
  templates: v.array(templateDto),
  history: v.array(mealHistoryEntry),
  cursors: v.object({
    ingredient: v.union(v.string(), v.null()),
    cookedFood: v.union(v.string(), v.null()),
    recipe: v.union(v.string(), v.null()),
    savedFood: v.union(v.string(), v.null()),
    templates: v.union(v.string(), v.null()),
    history: v.union(v.string(), v.null()),
  }),
})

export const reuseSuggestions = v.object({
  suggestions: v.array(
    v.object({
      mealId: v.id('meals'),
      itemId: v.id('mealItems'),
      name: v.string(),
      occurrences: v.number(),
      foodIdentity: v.optional(foodIdentityValidator),
    }),
  ),
})
