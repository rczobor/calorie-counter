import { type ColumnDef } from "@tanstack/react-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { BookOpenText, FolderTree, Trash2, Wheat } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { isConvexConfigured } from "@/integrations/convex/config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CustomIngredientSwitchRow,
  IngredientLineModeToggle,
} from "@/components/nutrition/ingredient-line-controls";
import {
  NUTRITION_UNIT_OPTIONS,
  type NutritionUnit,
  formatKcalPer100,
  getKcalPer100,
  toErrorMessage,
} from "@/lib/nutrition";

const EMPTY_MANAGEMENT_DATA = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
};

type PendingConfirmation = {
  message: string;
  successText: string;
  action: () => Promise<unknown>;
};

type FoodGroupTableRow = {
  id: Id<"foodGroups">;
  group: Doc<"foodGroups">;
  name: string;
  appliesTo: "ingredient" | "cookedFood";
  status: "Active" | "Archived";
};

type IngredientTableRow = {
  id: Id<"ingredients">;
  ingredient: Doc<"ingredients">;
  name: string;
  brand: string;
  kcalPer100: number;
  ignoreCalories: boolean;
  status: "Active" | "Archived";
};

type RecipeTableRow = {
  id: Id<"recipes">;
  recipe: Doc<"recipes">;
  name: string;
  latestVersionNumber: number;
  status: "Active" | "Archived";
};

type RecipeIngredientPickerRow = {
  id: Id<"ingredients">;
  name: string;
  brand: string;
  kcalPer100: number;
  ignoreCalories: boolean;
};

type ExistingRecipeIngredientDraft = {
  draftId: string;
  sourceType: "ingredient";
  ingredientId: Id<"ingredients">;
  referenceAmount: number;
  referenceUnit: NutritionUnit;
};

type CustomRecipeIngredientDraft = {
  draftId: string;
  sourceType: "custom";
  name: string;
  kcalPer100: number;
  ignoreCalories: boolean;
  referenceAmount: number;
  referenceUnit: NutritionUnit;
  saveToCatalog: boolean;
};

type RecipeIngredientDraft =
  | ExistingRecipeIngredientDraft
  | CustomRecipeIngredientDraft;

export const Route = createFileRoute("/manage")({
  ssr: false,
  component: ManagePage,
});

function ManagePage() {
  if (!isConvexConfigured) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Convex configuration is missing.
        </p>
      </main>
    );
  }

  return <ManagePageContent />;
}

function ManagePageContent() {
  const [showArchived, setShowArchived] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const [editingGroupId, setEditingGroupId] = useState<Id<"foodGroups"> | null>(
    null,
  );
  const [groupName, setGroupName] = useState("");
  const [groupScope, setGroupScope] = useState<"ingredient" | "cookedFood">(
    "ingredient",
  );

  const [editingIngredientId, setEditingIngredientId] =
    useState<Id<"ingredients"> | null>(null);
  const [ingredientName, setIngredientName] = useState("");
  const [ingredientBrand, setIngredientBrand] = useState("");
  const [ingredientKcal, setIngredientKcal] = useState("");
  const [ingredientIgnoreCalories, setIngredientIgnoreCalories] =
    useState(false);
  const [ingredientGroupId, setIngredientGroupId] = useState<
    Id<"foodGroups"> | ""
  >("");
  const [ingredientNotes, setIngredientNotes] = useState("");

  const [editingRecipeId, setEditingRecipeId] = useState<Id<"recipes"> | null>(
    null,
  );
  const [recipeName, setRecipeName] = useState("");
  const [recipeDescription, setRecipeDescription] = useState("");
  const [recipeInstructions, setRecipeInstructions] = useState("");
  const [recipeNotes, setRecipeNotes] = useState("");
  const [recipeLineMode, setRecipeLineMode] = useState<"ingredient" | "custom">(
    "ingredient",
  );
  const [recipeLineIngredientId, setRecipeLineIngredientId] = useState<
    Id<"ingredients"> | ""
  >("");
  const [recipeLineCustomName, setRecipeLineCustomName] = useState("");
  const [recipeLineCustomKcal, setRecipeLineCustomKcal] = useState("");
  const [recipeLineCustomIgnoreCalories, setRecipeLineCustomIgnoreCalories] =
    useState(false);
  const [recipeLineCustomSaveToCatalog, setRecipeLineCustomSaveToCatalog] =
    useState(true);
  const [recipeLineAmount, setRecipeLineAmount] = useState("");
  const [recipeLineUnit, setRecipeLineUnit] = useState<NutritionUnit>("g");
  const [recipeIngredientLines, setRecipeIngredientLines] = useState<
    RecipeIngredientDraft[]
  >([]);
  const [recipeLineAmountDraftById, setRecipeLineAmountDraftById] = useState<
    Record<string, string>
  >({});
  const [recipeLineKcalDraftById, setRecipeLineKcalDraftById] = useState<
    Record<string, string>
  >({});

  const dataResult = useQuery(api.nutrition.getManagementData);
  const data = (dataResult ?? EMPTY_MANAGEMENT_DATA) as NonNullable<
    typeof dataResult
  >;
  const isLoading = dataResult === undefined;

  const createFoodGroup = useMutation(api.nutrition.createFoodGroup);
  const updateFoodGroup = useMutation(api.nutrition.updateFoodGroup);
  const setFoodGroupArchived = useMutation(api.nutrition.setFoodGroupArchived);
  const deleteFoodGroup = useMutation(api.nutrition.deleteFoodGroup);

  const createIngredient = useMutation(api.nutrition.createIngredient);
  const updateIngredient = useMutation(api.nutrition.updateIngredient);
  const setIngredientArchived = useMutation(
    api.nutrition.setIngredientArchived,
  );
  const deleteIngredient = useMutation(api.nutrition.deleteIngredient);

  const createRecipe = useMutation(api.nutrition.createRecipe);
  const updateRecipeCurrentVersion = useMutation(
    api.nutrition.updateRecipeCurrentVersion,
  );
  const setRecipeArchived = useMutation(api.nutrition.setRecipeArchived);
  const deleteRecipe = useMutation(api.nutrition.deleteRecipe);

  const groups = data.foodGroups
    .filter((group) => (showArchived ? true : !group.archived))
    .filter(
      (group) =>
        group.appliesTo === "ingredient" || group.appliesTo === "cookedFood",
    );
  const ingredients = data.ingredients.filter((item) =>
    showArchived ? true : !item.archived,
  );
  const recipes = data.recipes.filter((item) =>
    showArchived ? true : !item.archived,
  );

  const ingredientById = useMemo(
    () => new Map(data.ingredients.map((item) => [item._id, item])),
    [data.ingredients],
  );

  const recipeVersionByRecipeId = useMemo(() => {
    const map = new Map<Id<"recipes">, Doc<"recipeVersions">>();
    for (const version of data.recipeVersions) {
      if (version.isCurrent && !map.has(version.recipeId)) {
        map.set(version.recipeId, version);
      }
    }
    return map;
  }, [data.recipeVersions]);

  const recipeIngredientsByVersionId = useMemo(() => {
    const map = new Map<
      Id<"recipeVersions">,
      Doc<"recipeVersionIngredients">[]
    >();
    for (const line of data.recipeVersionIngredients) {
      const bucket = map.get(line.recipeVersionId);
      if (bucket) {
        bucket.push(line);
      } else {
        map.set(line.recipeVersionId, [line]);
      }
    }
    return map;
  }, [data.recipeVersionIngredients]);

  async function runAction(
    successText: string,
    action: () => Promise<unknown>,
  ) {
    try {
      await action();
      toast.success(successText);
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  }

  const confirmAndRunAction = (
    message: string,
    successText: string,
    action: () => Promise<unknown>,
  ) => {
    setPendingConfirmation({
      message,
      successText,
      action,
    });
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmDialogOpenChange = (open: boolean) => {
    setIsConfirmDialogOpen(open);
    if (!open) {
      setPendingConfirmation(null);
    }
  };

  const confirmPendingAction = () => {
    if (!pendingConfirmation) {
      return;
    }
    const { successText, action } = pendingConfirmation;
    setIsConfirmDialogOpen(false);
    setPendingConfirmation(null);
    void runAction(successText, action);
  };

  const resetGroupForm = () => {
    setEditingGroupId(null);
    setGroupName("");
    setGroupScope("ingredient");
  };

  const resetIngredientForm = () => {
    setEditingIngredientId(null);
    setIngredientName("");
    setIngredientBrand("");
    setIngredientKcal("");
    setIngredientIgnoreCalories(false);
    setIngredientGroupId("");
    setIngredientNotes("");
  };

  const resetRecipeForm = () => {
    setEditingRecipeId(null);
    setRecipeName("");
    setRecipeDescription("");
    setRecipeInstructions("");
    setRecipeNotes("");
    setRecipeLineMode("ingredient");
    setRecipeLineIngredientId("");
    setRecipeLineCustomName("");
    setRecipeLineCustomKcal("");
    setRecipeLineCustomIgnoreCalories(false);
    setRecipeLineCustomSaveToCatalog(true);
    setRecipeLineAmount("");
    setRecipeLineUnit("g");
    setRecipeIngredientLines([]);
    setRecipeLineAmountDraftById({});
    setRecipeLineKcalDraftById({});
  };

  const foodGroupRows = useMemo<FoodGroupTableRow[]>(
    () =>
      groups.map((group) => ({
        id: group._id,
        group,
        name: group.name,
        appliesTo: (group as { appliesTo: "ingredient" | "cookedFood" })
          .appliesTo,
        status: group.archived ? "Archived" : "Active",
      })),
    [groups],
  );

  const foodGroupColumns: ColumnDef<FoodGroupTableRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "appliesTo",
      header: "Scope",
      cell: ({ row }) => row.original.appliesTo,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const group = row.original.group;
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingGroupId(group._id);
                setGroupName(group.name);
                setGroupScope(
                  (group as { appliesTo: "ingredient" | "cookedFood" })
                    .appliesTo,
                );
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runAction(
                  group.archived ? "Group restored." : "Group archived.",
                  async () => {
                    await setFoodGroupArchived({
                      groupId: group._id,
                      archived: !group.archived,
                    });
                  },
                )
              }
            >
              {group.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`Delete ${group.name}`}
              onClick={() =>
                confirmAndRunAction(
                  "Delete this group permanently?",
                  "Group deleted.",
                  async () => {
                    await deleteFoodGroup({ groupId: group._id });
                    if (editingGroupId === group._id) {
                      resetGroupForm();
                    }
                  },
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  const ingredientRows = useMemo<IngredientTableRow[]>(
    () =>
      ingredients.map((ingredient) => ({
        id: ingredient._id,
        ingredient,
        name: ingredient.name,
        brand: ingredient.brand ?? "",
        kcalPer100: getKcalPer100(ingredient),
        ignoreCalories: Boolean(
          (ingredient as { ignoreCalories?: boolean }).ignoreCalories,
        ),
        status: ingredient.archived ? "Archived" : "Active",
      })),
    [ingredients],
  );

  const ingredientColumns: ColumnDef<IngredientTableRow>[] = [
    {
      accessorKey: "name",
      header: "Ingredient",
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.name}</p>
          {row.original.brand ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.original.brand}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "kcalPer100",
      header: "kcal/100",
      cell: ({ row }) => formatKcalPer100(row.original.kcalPer100),
    },
    {
      accessorKey: "ignoreCalories",
      header: "Calories",
      cell: ({ row }) => (row.original.ignoreCalories ? "Ignored" : "Counted"),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const ingredient = row.original.ingredient;
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingIngredientId(ingredient._id);
                setIngredientName(ingredient.name);
                setIngredientBrand(ingredient.brand ?? "");
                setIngredientKcal(formatKcalPer100(getKcalPer100(ingredient)));
                setIngredientIgnoreCalories(
                  Boolean(
                    (ingredient as { ignoreCalories?: boolean }).ignoreCalories,
                  ),
                );
                setIngredientGroupId(ingredient.groupIds[0] ?? "");
                setIngredientNotes(ingredient.notes ?? "");
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runAction(
                  ingredient.archived
                    ? "Ingredient restored."
                    : "Ingredient archived.",
                  async () => {
                    await setIngredientArchived({
                      ingredientId: ingredient._id,
                      archived: !ingredient.archived,
                    });
                  },
                )
              }
            >
              {ingredient.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`Delete ${ingredient.name}`}
              onClick={() =>
                confirmAndRunAction(
                  "Delete this ingredient permanently?",
                  "Ingredient deleted.",
                  async () => {
                    await deleteIngredient({ ingredientId: ingredient._id });
                    if (editingIngredientId === ingredient._id) {
                      resetIngredientForm();
                    }
                  },
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  const recipeIngredientRows = useMemo<RecipeIngredientPickerRow[]>(
    () =>
      ingredients.map((ingredient) => ({
        id: ingredient._id,
        name: ingredient.name,
        brand: ingredient.brand ?? "",
        kcalPer100: getKcalPer100(ingredient),
        ignoreCalories: Boolean(
          (ingredient as { ignoreCalories?: boolean }).ignoreCalories,
        ),
      })),
    [ingredients],
  );

  const recipeIngredientColumns: ColumnDef<RecipeIngredientPickerRow>[] = [
    {
      id: "name",
      accessorFn: (row) => `${row.name} ${row.brand}`.trim(),
      header: "Ingredient",
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.name}</p>
          {row.original.brand ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.original.brand}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "kcalPer100",
      header: "kcal/100",
      cell: ({ row }) => formatKcalPer100(row.original.kcalPer100),
    },
    {
      accessorKey: "ignoreCalories",
      header: "Calories",
      cell: ({ row }) => (row.original.ignoreCalories ? "Ignored" : "Counted"),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Select</div>,
      cell: ({ row }) => {
        const isSelected = row.original.id === recipeLineIngredientId;
        return (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              onClick={() => setRecipeLineIngredientId(row.original.id)}
            >
              {isSelected ? "Selected" : "Use"}
            </Button>
          </div>
        );
      },
    },
  ];

  const recipeRows = useMemo<RecipeTableRow[]>(
    () =>
      recipes.map((recipe) => ({
        id: recipe._id,
        recipe,
        name: recipe.name,
        latestVersionNumber: recipe.latestVersionNumber,
        status: recipe.archived ? "Archived" : "Active",
      })),
    [recipes],
  );

  const recipeColumns: ColumnDef<RecipeTableRow>[] = [
    {
      accessorKey: "name",
      header: "Recipe",
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            v{row.original.latestVersionNumber}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const recipe = row.original.recipe;
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const currentVersion = recipeVersionByRecipeId.get(recipe._id);
                if (!currentVersion) {
                  return;
                }
                const versionIngredients =
                  recipeIngredientsByVersionId.get(currentVersion._id) ?? [];
                setEditingRecipeId(recipe._id);
                setRecipeName(recipe.name);
                setRecipeDescription(recipe.description ?? "");
                setRecipeInstructions(currentVersion.instructions ?? "");
                setRecipeNotes(currentVersion.notes ?? "");
                setRecipeLineAmountDraftById({});
                setRecipeLineKcalDraftById({});
                setRecipeIngredientLines(
                  versionIngredients.map((line) => {
                    const sourceType = line.sourceType;
                    const referenceAmount = line.referenceAmount;
                    const referenceUnit = line.referenceUnit;
                    if (sourceType === "custom" || !line.ingredientId) {
                      return {
                        draftId: createDraftId(),
                        sourceType: "custom" as const,
                        name:
                          (line as { ingredientNameSnapshot?: string })
                            .ingredientNameSnapshot ?? "Custom ingredient",
                        kcalPer100:
                          (line as { kcalPer100Snapshot?: number })
                            .kcalPer100Snapshot ?? 0,
                        ignoreCalories: Boolean(
                          (line as { ignoreCaloriesSnapshot?: boolean })
                            .ignoreCaloriesSnapshot,
                        ),
                        referenceAmount,
                        referenceUnit,
                        saveToCatalog: false,
                      };
                    }
                    return {
                      draftId: createDraftId(),
                      sourceType: "ingredient" as const,
                      ingredientId: line.ingredientId,
                      referenceAmount,
                      referenceUnit,
                    };
                  }),
                );
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runAction(
                  recipe.archived ? "Recipe restored." : "Recipe archived.",
                  async () => {
                    await setRecipeArchived({
                      recipeId: recipe._id,
                      archived: !recipe.archived,
                    });
                  },
                )
              }
            >
              {recipe.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`Delete ${recipe.name}`}
              onClick={() =>
                confirmAndRunAction(
                  "Delete this recipe permanently?",
                  "Recipe deleted.",
                  async () => {
                    await deleteRecipe({ recipeId: recipe._id });
                    if (editingRecipeId === recipe._id) {
                      resetRecipeForm();
                    }
                  },
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  const addRecipeIngredientLine = () => {
    const parsedAmount = Number(recipeLineAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    if (recipeLineMode === "ingredient") {
      if (!recipeLineIngredientId) {
        return;
      }
      setRecipeIngredientLines((current) => [
        ...current,
        {
          draftId: createDraftId(),
          sourceType: "ingredient",
          ingredientId: recipeLineIngredientId,
          referenceAmount: parsedAmount,
          referenceUnit: recipeLineUnit,
        },
      ]);
      setRecipeLineIngredientId("");
      setRecipeLineAmount("");
      return;
    }

    const parsedKcal = Number(recipeLineCustomKcal);
    if (!recipeLineCustomName.trim()) {
      return;
    }
    if (
      !recipeLineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal <= 0)
    ) {
      return;
    }
    const kcalPer100 =
      recipeLineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal < 0)
        ? 0
        : parsedKcal;

    setRecipeIngredientLines((current) => [
      ...current,
      {
        draftId: createDraftId(),
        sourceType: "custom",
        name: recipeLineCustomName.trim(),
        kcalPer100: kcalPer100,
        ignoreCalories: recipeLineCustomIgnoreCalories,
        referenceAmount: parsedAmount,
        referenceUnit: recipeLineUnit,
        saveToCatalog: recipeLineCustomSaveToCatalog,
      },
    ]);
    setRecipeLineCustomName("");
    setRecipeLineCustomKcal("");
    setRecipeLineCustomIgnoreCalories(false);
    setRecipeLineCustomSaveToCatalog(true);
    setRecipeLineAmount("");
  };

  const removeRecipeIngredientLine = (draftId: string) => {
    setRecipeIngredientLines((current) =>
      current.filter((line) => line.draftId !== draftId),
    );
    setRecipeLineAmountDraftById((current) => {
      if (!(draftId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[draftId];
      return next;
    });
    setRecipeLineKcalDraftById((current) => {
      if (!(draftId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[draftId];
      return next;
    });
  };

  const updateRecipeIngredientLine = (
    draftId: string,
    updater: (line: RecipeIngredientDraft) => RecipeIngredientDraft,
  ) => {
    setRecipeIngredientLines((current) =>
      current.map((line) => (line.draftId === draftId ? updater(line) : line)),
    );
  };

  const updateCustomRecipeIngredientLine = (
    draftId: string,
    updater: (line: CustomRecipeIngredientDraft) => CustomRecipeIngredientDraft,
  ) => {
    updateRecipeIngredientLine(draftId, (line) =>
      line.sourceType === "custom" ? updater(line) : line,
    );
  };

  const updateRecipeIngredientLineAmount = (
    draftId: string,
    nextAmount: number,
  ) => {
    updateRecipeIngredientLine(draftId, (line) => ({
      ...line,
      referenceAmount: nextAmount,
    }));
  };

  const updateRecipeIngredientLineUnit = (
    draftId: string,
    nextUnit: NutritionUnit,
  ) => {
    updateRecipeIngredientLine(draftId, (line) => ({
      ...line,
      referenceUnit: nextUnit,
    }));
  };

  const commitRecipeIngredientLineAmount = (draftId: string) => {
    const rawValue = recipeLineAmountDraftById[draftId];
    if (rawValue !== undefined) {
      const parsedAmount = Number(rawValue);
      if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
        updateRecipeIngredientLineAmount(draftId, parsedAmount);
      }
    }
    setRecipeLineAmountDraftById((current) => {
      if (!(draftId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[draftId];
      return next;
    });
  };

  const commitRecipeIngredientLineKcal = (draftId: string) => {
    const rawValue = recipeLineKcalDraftById[draftId];
    if (rawValue !== undefined) {
      const parsedKcal = Number(rawValue);
      updateCustomRecipeIngredientLine(draftId, (line) => {
        if (line.ignoreCalories) {
          return {
            ...line,
            kcalPer100:
              Number.isFinite(parsedKcal) && parsedKcal >= 0 ? parsedKcal : 0,
          };
        }
        if (Number.isFinite(parsedKcal) && parsedKcal > 0) {
          return { ...line, kcalPer100: parsedKcal };
        }
        return line;
      });
    }
    setRecipeLineKcalDraftById((current) => {
      if (!(draftId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[draftId];
      return next;
    });
  };

  const recipeLineEditorColumns: ColumnDef<RecipeIngredientDraft>[] = [
    {
      id: "name",
      header: () => <div className="w-[220px]">Name</div>,
      cell: ({ row }) => {
        const line = row.original;
        const label =
          line.sourceType === "ingredient"
            ? (ingredientById.get(line.ingredientId)?.name ?? "Ingredient")
            : line.name;

        if (line.sourceType === "custom") {
          return (
            <div className="w-[220px]">
              <Input
                aria-label={`${label || "Custom ingredient"} name`}
                className="h-8 text-sm"
                placeholder="Ingredient"
                value={line.name}
                onChange={(event) =>
                  updateCustomRecipeIngredientLine(
                    line.draftId,
                    (customLine) => ({
                      ...customLine,
                      name: event.target.value,
                    }),
                  )
                }
              />
            </div>
          );
        }

        return (
          <div className="flex h-8 w-[220px] items-center truncate text-sm text-foreground">
            {label}
          </div>
        );
      },
    },
    {
      id: "kcalPer100",
      header: () => <div className="w-[120px]">kcal/100</div>,
      cell: ({ row }) => {
        const line = row.original;
        const label =
          line.sourceType === "ingredient"
            ? (ingredientById.get(line.ingredientId)?.name ?? "Ingredient")
            : line.name;

        if (line.sourceType === "custom") {
          return (
            <Input
              type="number"
              min={line.ignoreCalories ? "0" : "1"}
              step="1"
              aria-label={`${label || "Custom ingredient"} kcal per 100`}
              placeholder="kcal/100"
              disabled={line.ignoreCalories}
              className="h-8 w-[120px]"
              value={
                recipeLineKcalDraftById[line.draftId] ??
                line.kcalPer100.toString()
              }
              onChange={(event) =>
                setRecipeLineKcalDraftById((current) => ({
                  ...current,
                  [line.draftId]: event.target.value,
                }))
              }
              onBlur={() => commitRecipeIngredientLineKcal(line.draftId)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          );
        }

        return (
          <span className="block w-[120px] text-sm text-foreground">
            {formatKcalPer100(
              getKcalPer100(ingredientById.get(line.ingredientId) ?? {}),
            )}
          </span>
        );
      },
    },
    {
      id: "amount",
      header: () => <div className="w-[120px]">Amount</div>,
      cell: ({ row }) => {
        const line = row.original;
        const label =
          line.sourceType === "ingredient"
            ? (ingredientById.get(line.ingredientId)?.name ?? "Ingredient")
            : line.name;

        return (
          <Input
            type="number"
            min="0.01"
            step="0.01"
            aria-label={`${label} amount`}
            className="h-8 w-[120px]"
            value={
              recipeLineAmountDraftById[line.draftId] ??
              line.referenceAmount.toString()
            }
            onChange={(event) =>
              setRecipeLineAmountDraftById((current) => ({
                ...current,
                [line.draftId]: event.target.value,
              }))
            }
            onBlur={() => commitRecipeIngredientLineAmount(line.draftId)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        );
      },
    },
    {
      id: "unit",
      header: () => <div className="w-[130px]">Unit</div>,
      cell: ({ row }) => {
        const line = row.original;
        const label =
          line.sourceType === "ingredient"
            ? (ingredientById.get(line.ingredientId)?.name ?? "Ingredient")
            : line.name;

        return (
          <Select
            ariaLabel={`${label} unit`}
            className="w-[130px]"
            value={line.referenceUnit}
            onValueChange={(value) =>
              updateRecipeIngredientLineUnit(
                line.draftId,
                (value as NutritionUnit | null) ?? "g",
              )
            }
            options={NUTRITION_UNIT_OPTIONS}
          />
        );
      },
    },
    {
      id: "ignore",
      header: () => <div className="w-[90px] text-center">Ignore</div>,
      cell: ({ row }) => {
        const line = row.original;
        const label =
          line.sourceType === "ingredient"
            ? (ingredientById.get(line.ingredientId)?.name ?? "Ingredient")
            : line.name;

        if (line.sourceType !== "custom") {
          return (
            <span className="block w-[90px] text-center text-xs text-muted-foreground">
              -
            </span>
          );
        }

        return (
          <div className="flex w-[90px] justify-center">
            <Switch
              size="sm"
              aria-label={`${label || "Custom ingredient"} ignore calories`}
              checked={line.ignoreCalories}
              onCheckedChange={(checked) =>
                updateCustomRecipeIngredientLine(
                  line.draftId,
                  (customLine) => ({
                    ...customLine,
                    ignoreCalories: Boolean(checked),
                  }),
                )
              }
            />
          </div>
        );
      },
    },
    {
      id: "save",
      header: () => <div className="w-[90px] text-center">Save</div>,
      cell: ({ row }) => {
        const line = row.original;
        const label =
          line.sourceType === "ingredient"
            ? (ingredientById.get(line.ingredientId)?.name ?? "Ingredient")
            : line.name;

        if (line.sourceType !== "custom") {
          return (
            <span className="block w-[90px] text-center text-xs text-muted-foreground">
              -
            </span>
          );
        }

        return (
          <div className="flex w-[90px] justify-center">
            <Switch
              size="sm"
              aria-label={`${label || "Custom ingredient"} save to ingredient catalog`}
              checked={line.saveToCatalog}
              onCheckedChange={(checked) =>
                updateCustomRecipeIngredientLine(
                  line.draftId,
                  (customLine) => ({
                    ...customLine,
                    saveToCatalog: Boolean(checked),
                  }),
                )
              }
            />
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="w-[120px] text-right">Action</div>,
      cell: ({ row }) => (
        <div className="flex w-[120px] justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => removeRecipeIngredientLine(row.original.draftId)}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Loading management data…
        </p>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_10%,#fff7e4_0%,#f5f6f4_44%,#e8f0ea_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,#1d2535_0%,#111a26_44%,#0a1119_100%)]">
        <section className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25">
            <h1 data-display="true" className="text-4xl text-foreground">
              Catalog Management
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage food groups, ingredients, and recipes.
            </p>
            <label className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived records
            </label>
          </div>

          <div className="order-2 mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4 text-amber-700" />
                  Food Groups
                </CardTitle>
                <CardDescription>
                  Used to classify ingredients and cooked foods.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    aria-label="Group name"
                    placeholder="Group name"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                  />
                  <Select
                    ariaLabel="Group scope"
                    value={groupScope}
                    onValueChange={(value) =>
                      setGroupScope(
                        (value as "ingredient" | "cookedFood" | null) ??
                          "ingredient",
                      )
                    }
                    options={[
                      { value: "ingredient", label: "Ingredient only" },
                      { value: "cookedFood", label: "Cooked food only" },
                    ]}
                  />
                  <Button
                    onClick={() =>
                      void runAction(
                        editingGroupId ? "Group updated." : "Group created.",
                        async () => {
                          if (editingGroupId) {
                            await updateFoodGroup({
                              groupId: editingGroupId,
                              name: groupName,
                              appliesTo: groupScope,
                            });
                          } else {
                            await createFoodGroup({
                              name: groupName,
                              appliesTo: groupScope,
                            });
                          }
                          resetGroupForm();
                        },
                      )
                    }
                  >
                    {editingGroupId ? "Save" : "Create"}
                  </Button>
                </div>
                <DataTable
                  columns={foodGroupColumns}
                  data={foodGroupRows}
                  searchColumnId="name"
                  searchPlaceholder="Search groups by name"
                  emptyText="No food groups found."
                />
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wheat className="h-4 w-4 text-amber-700" />
                  Ingredients
                </CardTitle>
                <CardDescription>
                  Store kcal/100g and whether calories are ignored for this
                  ingredient.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Ingredient name"
                    placeholder="Ingredient name"
                    value={ingredientName}
                    onChange={(event) => setIngredientName(event.target.value)}
                  />
                  <Input
                    aria-label="Ingredient brand"
                    placeholder="Brand"
                    value={ingredientBrand}
                    onChange={(event) => setIngredientBrand(event.target.value)}
                  />
                  <Input
                    type="number"
                    aria-label="Ingredient kcal per 100"
                    placeholder="kcal / 100"
                    value={ingredientKcal}
                    onChange={(event) => setIngredientKcal(event.target.value)}
                  />
                  <Select
                    ariaLabel="Ingredient group"
                    value={ingredientGroupId}
                    onValueChange={(value) =>
                      setIngredientGroupId(
                        (value as Id<"foodGroups"> | "" | null) ?? "",
                      )
                    }
                    placeholder="Group (optional)"
                    options={[
                      { value: "", label: "No group" },
                      ...groups
                        .filter((group) => group.appliesTo === "ingredient")
                        .map((group) => ({
                          value: group._id,
                          label: group.name,
                        })),
                    ]}
                  />
                  <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                    Ignore calories
                    <Switch
                      checked={ingredientIgnoreCalories}
                      onCheckedChange={(checked) =>
                        setIngredientIgnoreCalories(Boolean(checked))
                      }
                    />
                  </label>
                </div>
                <Textarea
                  aria-label="Ingredient notes"
                  placeholder="Notes"
                  value={ingredientNotes}
                  onChange={(event) => setIngredientNotes(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      void runAction(
                        editingIngredientId
                          ? "Ingredient updated."
                          : "Ingredient created.",
                        async () => {
                          const payload = {
                            name: ingredientName,
                            brand: ingredientBrand.trim() || undefined,
                            kcalPer100: Number(ingredientKcal),
                            ignoreCalories: ingredientIgnoreCalories,
                            groupIds: ingredientGroupId
                              ? [ingredientGroupId]
                              : [],
                            notes: ingredientNotes.trim() || undefined,
                          };
                          if (editingIngredientId) {
                            await updateIngredient({
                              ingredientId: editingIngredientId,
                              ...payload,
                            });
                          } else {
                            await createIngredient(payload);
                          }
                          resetIngredientForm();
                        },
                      )
                    }
                  >
                    {editingIngredientId ? "Save ingredient" : "Add ingredient"}
                  </Button>
                  {editingIngredientId ? (
                    <Button variant="outline" onClick={resetIngredientForm}>
                      Cancel
                    </Button>
                  ) : null}
                </div>

                <DataTable
                  columns={ingredientColumns}
                  data={ingredientRows}
                  searchColumnId="name"
                  searchPlaceholder="Search ingredients by name"
                  emptyText="No ingredients found."
                />
              </CardContent>
            </Card>
          </div>

          <div className="order-1 mt-6 grid grid-cols-1 gap-5">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpenText className="h-4 w-4 text-sky-700" />
                  Recipes
                </CardTitle>
                <CardDescription>
                  Build recipe lines with existing or inline ingredients. Inline
                  lines can be optionally saved to catalog.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Recipe name"
                    placeholder="Recipe name"
                    value={recipeName}
                    onChange={(event) => setRecipeName(event.target.value)}
                  />
                  <Input
                    aria-label="Recipe description"
                    placeholder="Description"
                    value={recipeDescription}
                    onChange={(event) =>
                      setRecipeDescription(event.target.value)
                    }
                  />
                </div>
                <Textarea
                  aria-label="Recipe instructions"
                  placeholder="Instructions"
                  value={recipeInstructions}
                  onChange={(event) =>
                    setRecipeInstructions(event.target.value)
                  }
                />
                <Input
                  aria-label="Recipe version notes"
                  placeholder="Version notes"
                  value={recipeNotes}
                  onChange={(event) => setRecipeNotes(event.target.value)}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-foreground">
                    Add ingredient line
                  </p>
                  <IngredientLineModeToggle
                    value={recipeLineMode}
                    onValueChange={setRecipeLineMode}
                  />
                </div>

                {recipeLineMode === "ingredient" ? (
                  <div className="space-y-3">
                    <DataTable
                      columns={recipeIngredientColumns}
                      data={recipeIngredientRows}
                      searchColumnId="name"
                      searchPlaceholder="Search ingredients by name or brand"
                      emptyText="No ingredients found."
                    />
                    <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
                      <Input
                        aria-label="Selected recipe ingredient"
                        value={
                          recipeLineIngredientId
                            ? (ingredientById.get(recipeLineIngredientId)
                                ?.name ?? "Unknown ingredient")
                            : ""
                        }
                        placeholder="Select ingredient from table"
                        readOnly
                      />
                      <Input
                        type="number"
                        aria-label="Recipe reference amount"
                        placeholder="Amount"
                        value={recipeLineAmount}
                        onChange={(event) =>
                          setRecipeLineAmount(event.target.value)
                        }
                      />
                      <Select
                        ariaLabel="Recipe reference unit"
                        value={recipeLineUnit}
                        onValueChange={(value) =>
                          setRecipeLineUnit(
                            (value as NutritionUnit | null) ?? "g",
                          )
                        }
                        options={NUTRITION_UNIT_OPTIONS}
                      />
                      <Button
                        variant="outline"
                        onClick={addRecipeIngredientLine}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`grid gap-3 ${
                      recipeLineCustomIgnoreCalories
                        ? "sm:grid-cols-[1.2fr_0.7fr_0.7fr_auto]"
                        : "sm:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_auto]"
                    }`}
                  >
                    <Input
                      aria-label="Recipe custom ingredient name"
                      placeholder="Ingredient"
                      value={recipeLineCustomName}
                      onChange={(event) =>
                        setRecipeLineCustomName(event.target.value)
                      }
                    />
                    {recipeLineCustomIgnoreCalories ? null : (
                      <Input
                        type="number"
                        aria-label="Recipe custom kcal per 100"
                        placeholder="kcal/100"
                        value={recipeLineCustomKcal}
                        onChange={(event) =>
                          setRecipeLineCustomKcal(event.target.value)
                        }
                      />
                    )}
                    <Input
                      type="number"
                      aria-label="Recipe custom reference amount"
                      placeholder="Amount"
                      value={recipeLineAmount}
                      onChange={(event) =>
                        setRecipeLineAmount(event.target.value)
                      }
                    />
                    <Select
                      ariaLabel="Recipe custom reference unit"
                      value={recipeLineUnit}
                      onValueChange={(value) =>
                        setRecipeLineUnit(
                          (value as NutritionUnit | null) ?? "g",
                        )
                      }
                      options={NUTRITION_UNIT_OPTIONS}
                    />
                    <Button variant="outline" onClick={addRecipeIngredientLine}>
                      Add
                    </Button>
                    <CustomIngredientSwitchRow
                      ignoreCalories={recipeLineCustomIgnoreCalories}
                      onIgnoreCaloriesChange={setRecipeLineCustomIgnoreCalories}
                      saveToCatalog={recipeLineCustomSaveToCatalog}
                      onSaveToCatalogChange={setRecipeLineCustomSaveToCatalog}
                    />
                  </div>
                )}

                <div className="rounded-md border border-border/60 bg-muted/35 p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">
                      Recipe ingredients
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recipeIngredientLines.length} line
                      {recipeIngredientLines.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {recipeIngredientLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Add at least one ingredient line.
                    </p>
                  ) : (
                    <DataTable
                      columns={recipeLineEditorColumns}
                      data={recipeIngredientLines}
                      emptyText="Add at least one ingredient line."
                      className="[&_[data-slot=table]]:min-w-[980px] [&_[data-slot=table]]:table-auto"
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      void runAction(
                        editingRecipeId ? "Recipe updated." : "Recipe created.",
                        async () => {
                          const ingredientLines = recipeIngredientLines.map(
                            (line) =>
                              line.sourceType === "ingredient"
                                ? {
                                    sourceType: "ingredient" as const,
                                    ingredientId: line.ingredientId,
                                    referenceAmount: line.referenceAmount,
                                    referenceUnit: line.referenceUnit,
                                  }
                                : {
                                    sourceType: "custom" as const,
                                    name: line.name,
                                    kcalPer100: line.kcalPer100,
                                    ignoreCalories: line.ignoreCalories,
                                    referenceAmount: line.referenceAmount,
                                    referenceUnit: line.referenceUnit,
                                    saveToCatalog: line.saveToCatalog,
                                  },
                          );
                          const payload = {
                            name: recipeName,
                            description: recipeDescription.trim() || undefined,
                            instructions:
                              recipeInstructions.trim() || undefined,
                            notes: recipeNotes.trim() || undefined,
                            ingredientLines,
                          };
                          if (editingRecipeId) {
                            await updateRecipeCurrentVersion({
                              recipeId: editingRecipeId,
                              ...payload,
                            });
                          } else {
                            await createRecipe(payload);
                          }
                          resetRecipeForm();
                        },
                      )
                    }
                  >
                    {editingRecipeId ? "Save recipe" : "Create recipe"}
                  </Button>
                  {editingRecipeId ? (
                    <Button variant="outline" onClick={resetRecipeForm}>
                      Cancel
                    </Button>
                  ) : null}
                </div>

                <DataTable
                  columns={recipeColumns}
                  data={recipeRows}
                  searchColumnId="name"
                  searchPlaceholder="Search recipes by name"
                  emptyText="No recipes found."
                />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <AlertDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm deletion</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirmation?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2"
              variant="destructive"
              onClick={confirmPendingAction}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function createDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
