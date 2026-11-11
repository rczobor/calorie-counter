import { v } from 'convex/values'
import {
  expectedNutritionSnapshotValidator,
  nutritionProvenanceValidator,
  nutritionUnitValidator,
  mealEvidenceFields,
  foodIdentityValidator,
  historicalMealItemInput,
  macroGramsValidator,
  macroTotalsValidator,
  macrosValidator,
  energyProfileValidator,
  goalPlanValidator,
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
  macros: v.optional(macroTotalsValidator),
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
    // Per 100 g, like kcalPer100.
    macros: v.optional(macroGramsValidator),
    ...weighted,
  }),
  v.object({
    sourceType: v.literal('fixedCalories'),
    name: v.string(),
    calories: v.number(),
    // For the whole item, like calories.
    macros: v.optional(macroGramsValidator),
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
    // Per 100 of kcalBasisUnit, like kcalPer100.
    macros: v.optional(macroGramsValidator),
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
  macros: v.optional(macroTotalsValidator),
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
      macros: v.optional(macroGramsValidator),
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

export const cookedFoodWeightCorrectionInput = v.object({
  cookedFoodId: v.id('cookedFoods'),
  expectedEditRevision: v.number(),
  finishedWeightGrams: v.number(),
})
const cookedFoodWeightSummary = v.object({
  name: v.string(),
  finishedWeightGrams: v.number(),
  totalCalories: v.number(),
  kcalPer100: v.number(),
})
export const cookedFoodWeightCorrectionPreview = v.object({
  context: v.optional(loggingContext),
  input: cookedFoodWeightCorrectionInput,
  before: cookedFoodWeightSummary,
  after: cookedFoodWeightSummary,
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
        servingCount: v.optional(v.number()),
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
  macros: v.optional(macrosValidator),
})
export const foodDetails = v.object({
  context: v.optional(loggingContext),
  food: foodCandidate,
  editRevision: v.optional(v.number()),
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

const macroFoodKind = v.union(v.literal('ingredient'), v.literal('savedFood'))
// What the macros are measured against: a calorie unit, or one serving.
const calorieBasis = v.union(nutritionUnitValidator, v.literal('serving'))
export const foodMacrosInput = v.object({
  kind: macroFoodKind,
  foodId: v.string(),
  proteinG: v.number(),
  carbsG: v.number(),
  fatG: v.number(),
  nutritionProvenance: nutritionProvenanceValidator,
  // Previews set this so a save fails if the food changed after approval.
  expectedSnapshot: v.optional(
    v.object({
      kcal: v.number(),
      basis: calorieBasis,
      macros: v.union(macrosValidator, v.null()),
    }),
  ),
})
const macroFood = v.object({
  kind: macroFoodKind,
  id: v.string(),
  name: v.string(),
  kcal: v.number(),
  basis: calorieBasis,
})
export const foodMacrosPreview = v.object({
  context: v.optional(loggingContext),
  input: foodMacrosInput,
  food: macroFood,
  before: v.union(macrosValidator, v.null()),
  after: macrosValidator,
  macroKcal: v.number(),
  warnings: v.array(v.string()),
})
export const foodMacrosResult = v.object({
  context: v.optional(loggingContext),
  food: macroFood,
  macros: macrosValidator,
  change: v.union(v.literal('updated'), v.literal('unchanged')),
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
  macros: v.optional(macroTotalsValidator),
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
  omittedItemCount: v.optional(v.number()),
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

export const weightEntry = v.object({
  entryId: v.id('weightEntries'),
  measuredOn: v.string(),
  weightKg: v.number(),
  editRevision: v.number(),
})
export const weightHistoryResult = v.object({
  householdId: v.id('households'),
  personId: v.id('people'),
  person: v.string(),
  entries: v.array(weightEntry),
  cursor: v.union(v.string(), v.null()),
})
export const weightRecordResult = v.object({
  householdId: v.id('households'),
  personId: v.id('people'),
  person: v.string(),
  entry: weightEntry,
  change: v.union(
    v.literal('created'),
    v.literal('updated'),
    v.literal('unchanged'),
  ),
  previousWeightKg: v.optional(v.number()),
  path: v.string(),
  url: v.string(),
})

// Daily goals: a person's goal, the plan it serves and the check-in.
const kcalRange = v.object({ low: v.number(), high: v.number() })

const goalCheckIn = v.object({
  status: v.union(v.literal('learning'), v.literal('ready')),
  loggedDays: v.number(),
  requiredLoggedDays: v.number(),
  weighIns: v.number(),
  requiredWeighIns: v.number(),
  skippedIncompleteDays: v.array(
    v.object({ date: v.string(), kcal: v.number() }),
  ),
  formulaKcal: v.optional(v.number()),
  maintenanceKcal: v.optional(v.number()),
  likelyRangeKcal: v.optional(kcalRange),
  confidence: v.optional(v.string()),
  averageLoggedKcal: v.optional(v.number()),
  weightTrendKgPerWeek: v.optional(v.number()),
  suggestion: v.optional(
    v.object({
      goalKcal: v.number(),
      plannedKgPerWeek: v.number(),
      heldAtMinimum: v.boolean(),
      targetReached: v.boolean(),
      belowHealthyWeight: v.boolean(),
    }),
  ),
})

const goalState = v.object({
  goalKcal: v.number(),
  energyProfile: v.optional(energyProfileValidator),
  goalPlan: v.optional(goalPlanValidator),
})

export const goalStatusResult = v.object({
  householdId: v.id('households'),
  personId: v.id('people'),
  person: v.string(),
  editRevision: v.number(),
  currentGoalKcal: v.number(),
  energyProfile: v.optional(energyProfileValidator),
  goalPlan: v.optional(goalPlanValidator),
  history: v.array(
    v.object({
      effectiveDate: v.string(),
      goalKcal: v.number(),
      reason: v.optional(v.string()),
    }),
  ),
  checkIn: goalCheckIn,
  path: v.string(),
  url: v.string(),
})

export const goalChangeInput = v.object({
  personId: v.id('people'),
  expectedEditRevision: v.number(),
  effectiveDate: v.string(),
  goalKcal: v.optional(v.number()),
  energyProfile: v.optional(energyProfileValidator),
  // Omitted keeps the saved plan; null clears it.
  goalPlan: v.optional(v.union(goalPlanValidator, v.null())),
  reason: v.optional(v.string()),
})

export const goalChangePreview = v.object({
  householdId: v.id('households'),
  personId: v.id('people'),
  person: v.string(),
  input: goalChangeInput,
  before: goalState,
  after: goalState,
  basis: v.union(
    v.literal('stated'),
    v.literal('checkIn'),
    v.literal('formula'),
  ),
  working: v.optional(
    v.object({
      maintenanceKcal: v.number(),
      likelyRangeKcal: kcalRange,
      confidence: v.string(),
      adjustmentKcal: v.number(),
      plannedKgPerWeek: v.number(),
      heldAtMinimum: v.boolean(),
    }),
  ),
  targetProjection: v.optional(
    v.object({ targetWeightKg: v.number(), weeks: v.number() }),
  ),
  warnings: v.array(v.string()),
})

export const goalChangeResult = v.object({
  householdId: v.id('households'),
  personId: v.id('people'),
  person: v.string(),
  change: v.union(v.literal('updated'), v.literal('unchanged')),
  previous: goalState,
  current: goalState,
  editRevision: v.number(),
  effectiveDate: v.string(),
  path: v.string(),
  url: v.string(),
})
