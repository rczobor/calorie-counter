import { v } from 'convex/values'

// The app's interface languages; the client's Locale type must match.
export const localeValidator = v.union(v.literal('en'), v.literal('hu'))

export const nutritionProvenanceValidator = v.object({
  kind: v.optional(v.union(v.literal('estimate'), v.literal('provided'))),
  origin: v.optional(
    v.union(v.literal('label'), v.literal('database'), v.literal('generic')),
  ),
  verifiedOn: v.optional(v.string()),
  source: v.string(),
  assumptions: v.string(),
})

export const foodIdentityValidator = v.object({
  brand: v.optional(v.string()),
  variant: v.optional(v.string()),
  basis: v.union(v.literal('g'), v.literal('ml'), v.literal('serving')),
  servingSize: v.optional(v.number()),
  servingLabel: v.optional(v.string()),
})

export const mealEvidenceFields = {
  foodIdentity: v.optional(foodIdentityValidator),
  servingCount: v.optional(v.number()),
}

export const historicalMealItemInput = v.object({
  sourceType: v.literal('historical'),
  itemId: v.id('mealItems'),
  multiplier: v.number(),
  // Previews set this so a save fails if the source meal was edited after approval.
  expectedMealEditRevision: v.optional(v.number()),
})

export const nutritionUnitValidator = v.union(
  v.literal('pinch'),
  v.literal('teaspoon'),
  v.literal('tablespoon'),
  v.literal('piece'),
  v.literal('g'),
  v.literal('ml'),
)

export const expectedNutritionSnapshotValidator = v.object({
  name: v.string(),
  kcalPer100: v.number(),
  kcalBasisUnit: nutritionUnitValidator,
  ignoreCalories: v.boolean(),
})

export const groupScopeValidator = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
)

const ownerFields = {
  // Account attribution only; authorization uses householdId. The legacy
  // tokenIdentifier remains until migrations:rekeyAccounts replaces it.
  ownerUserId: v.optional(v.id('users')),
  ownerTokenIdentifier: v.optional(v.string()),
  householdId: v.id('households'),
}

// What the goal calculator needs about a person (see lib/energy.ts).
export const energyProfileValidator = v.object({
  sex: v.union(v.literal('female'), v.literal('male')),
  birthYear: v.number(),
  heightCm: v.number(),
  activity: v.union(
    v.literal('inactive'),
    v.literal('lowActive'),
    v.literal('active'),
    v.literal('veryActive'),
  ),
})

// The weight change a person's goal aims for; check-ins keep the goal on it.
export const goalPlanValidator = v.union(
  v.object({ direction: v.literal('maintain') }),
  v.object({
    direction: v.union(v.literal('lose'), v.literal('gain')),
    percentPerWeek: v.number(),
    targetWeightKg: v.optional(v.number()),
  }),
)

export const peopleFields = {
  ...ownerFields,
  name: v.string(),
  notes: v.optional(v.string()),
  currentDailyGoalKcal: v.number(),
  energyProfile: v.optional(energyProfileValidator),
  goalPlan: v.optional(goalPlanValidator),
  editRevision: v.optional(v.number()),
  archived: v.boolean(),
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

// One body weight per person per local calendar day, in kilograms.
export const weightEntriesFields = {
  ...ownerFields,
  personId: v.id('people'),
  measuredOn: v.string(),
  weightKg: v.number(),
  editRevision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
}

export const foodGroupsFields = {
  ...ownerFields,
  name: v.string(),
  appliesTo: groupScopeValidator,
  editRevision: v.optional(v.number()),
  archived: v.boolean(),
  createdAt: v.number(),
}

export const ingredientsFields = {
  ...ownerFields,
  name: v.string(),
  brand: v.optional(v.string()),
  variant: v.optional(v.string()),
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  kcalPer100: v.number(),
  kcalBasisUnit: nutritionUnitValidator,
  ignoreCalories: v.boolean(),
  editRevision: v.optional(v.number()),
  groupId: v.optional(v.id('foodGroups')),
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
  editRevision: v.optional(v.number()),
  createdAt: v.number(),
}

export const recipeVersionsFields = {
  ...ownerFields,
  recipeId: v.id('recipes'),
  versionNumber: v.number(),
  name: v.string(),
  instructions: v.optional(v.string()),
  notes: v.optional(v.string()),
  createdAt: v.number(),
}

const recipeVersionIngredientCommonFields = {
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  ...ownerFields,
  recipeVersionId: v.id('recipeVersions'),
  ingredientNameSnapshot: v.string(),
  kcalPer100Snapshot: v.number(),
  kcalBasisUnitSnapshot: nutritionUnitValidator,
  ignoreCaloriesSnapshot: v.boolean(),
  referenceAmount: v.number(),
  referenceUnit: nutritionUnitValidator,
  notes: v.optional(v.string()),
}

const recipeVersionIngredientIngredientFields = {
  ...recipeVersionIngredientCommonFields,
  sourceType: v.literal('ingredient'),
  ingredientId: v.id('ingredients'),
}

const recipeVersionIngredientCustomFields = {
  ...recipeVersionIngredientCommonFields,
  sourceType: v.literal('custom'),
  ingredientId: v.optional(v.id('ingredients')),
}

export const recipeVersionIngredientRecordValidator = v.union(
  v.object(recipeVersionIngredientIngredientFields),
  v.object(recipeVersionIngredientCustomFields),
)

export const cookSessionsFields = {
  ...ownerFields,
  label: v.string(),
  searchText: v.string(),
  cookedAt: v.number(),
  cookedByPersonId: v.optional(v.id('people')),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  editRevision: v.optional(v.number()),
  updatedAt: v.number(),
  createdAt: v.number(),
}

export const cookedFoodsFields = {
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  ...ownerFields,
  cookSessionId: v.id('cookSessions'),
  name: v.string(),
  recipeId: v.optional(v.id('recipes')),
  recipeVersionId: v.optional(v.id('recipeVersions')),
  groupId: v.optional(v.id('foodGroups')),
  finishedWeightGrams: v.number(),
  totalRawWeightGrams: v.number(),
  totalCalories: v.number(),
  kcalPer100: v.number(),
  editRevision: v.optional(v.number()),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  createdAt: v.number(),
}

const cookedFoodIngredientCommonFields = {
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  ...ownerFields,
  cookedFoodId: v.id('cookedFoods'),
  ingredientNameSnapshot: v.string(),
  referenceAmount: v.number(),
  referenceUnit: nutritionUnitValidator,
  countedAmount: v.optional(v.number()),
  ingredientKcalPer100Snapshot: v.number(),
  ingredientKcalBasisUnitSnapshot: nutritionUnitValidator,
  ignoreCaloriesSnapshot: v.boolean(),
  ingredientCaloriesSnapshot: v.number(),
  notes: v.optional(v.string()),
}

const cookedFoodIngredientIngredientFields = {
  ...cookedFoodIngredientCommonFields,
  sourceType: v.literal('ingredient'),
  ingredientId: v.id('ingredients'),
}

const cookedFoodIngredientCustomFields = {
  ...cookedFoodIngredientCommonFields,
  sourceType: v.literal('custom'),
  ingredientId: v.optional(v.id('ingredients')),
}

export const cookedFoodIngredientRecordValidator = v.union(
  v.object(cookedFoodIngredientIngredientFields),
  v.object(cookedFoodIngredientCustomFields),
)

export const mealsFields = {
  ...ownerFields,
  personId: v.id('people'),
  name: v.optional(v.string()),
  eatenOn: v.string(),
  notes: v.optional(v.string()),
  archived: v.boolean(),
  totalCalories: v.number(),
  itemCount: v.number(),
  editRevision: v.optional(v.number()),
  createdAt: v.number(),
}

const mealItemCommonFields = {
  ...mealEvidenceFields,
  nutritionProvenance: v.optional(nutritionProvenanceValidator),
  ...ownerFields,
  mealId: v.id('meals'),
  nameSnapshot: v.string(),
  caloriesSnapshot: v.number(),
  notes: v.optional(v.string()),
}

const weightedMealItemFields = {
  ...mealItemCommonFields,
  kcalPer100Snapshot: v.number(),
  kcalBasisUnitSnapshot: nutritionUnitValidator,
  ignoreCaloriesSnapshot: v.boolean(),
  consumedWeightGrams: v.number(),
}

const mealItemIngredientFields = {
  ...weightedMealItemFields,
  sourceType: v.literal('ingredient'),
  ingredientId: v.id('ingredients'),
}

const mealItemCustomByWeightFields = {
  ...weightedMealItemFields,
  sourceType: v.literal('customByWeight'),
  ingredientId: v.optional(v.id('ingredients')),
  kcalBasisUnitSnapshot: v.literal('g'),
}

const mealItemCookedFoodFields = {
  ...weightedMealItemFields,
  sourceType: v.literal('cookedFood'),
  cookedFoodId: v.id('cookedFoods'),
}

const mealItemFixedCaloriesFields = {
  ...mealItemCommonFields,
  sourceType: v.literal('fixedCalories'),
}

export const mealItemRecordValidator = v.union(
  v.object(mealItemIngredientFields),
  v.object(mealItemCustomByWeightFields),
  v.object(mealItemCookedFoodFields),
  v.object(mealItemFixedCaloriesFields),
)

export const dailySummariesFields = {
  ...ownerFields,
  personId: v.id('people'),
  eatenOn: v.string(),
  consumedCalories: v.number(),
  mealCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
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

export const recipeVersionIngredientValidator = v.union(
  v.object({
    _id: v.id('recipeVersionIngredients'),
    _creationTime: v.number(),
    ...recipeVersionIngredientIngredientFields,
  }),
  v.object({
    _id: v.id('recipeVersionIngredients'),
    _creationTime: v.number(),
    ...recipeVersionIngredientCustomFields,
  }),
)

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

export const cookedFoodIngredientValidator = v.union(
  v.object({
    _id: v.id('cookedFoodIngredients'),
    _creationTime: v.number(),
    ...cookedFoodIngredientIngredientFields,
  }),
  v.object({
    _id: v.id('cookedFoodIngredients'),
    _creationTime: v.number(),
    ...cookedFoodIngredientCustomFields,
  }),
)

export const mealValidator = v.object({
  _id: v.id('meals'),
  _creationTime: v.number(),
  ...mealsFields,
})

export const mealItemValidator = v.union(
  v.object({
    _id: v.id('mealItems'),
    _creationTime: v.number(),
    ...mealItemIngredientFields,
  }),
  v.object({
    _id: v.id('mealItems'),
    _creationTime: v.number(),
    ...mealItemCustomByWeightFields,
  }),
  v.object({
    _id: v.id('mealItems'),
    _creationTime: v.number(),
    ...mealItemCookedFoodFields,
  }),
  v.object({
    _id: v.id('mealItems'),
    _creationTime: v.number(),
    ...mealItemFixedCaloriesFields,
  }),
)

export const dailySummaryValidator = v.object({
  _id: v.id('dailySummaries'),
  _creationTime: v.number(),
  ...dailySummariesFields,
})
