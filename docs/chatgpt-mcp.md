# AI assistant integration

Calorie Counter exposes an authenticated MCP server for AI assistants such as
ChatGPT and Claude. The assistant provides the model and conversation; the app
does not call an LLM API or need an OpenAI or Anthropic API key. The same tools
can be used by other compatible MCP clients.

For public directory preparation, see the local
[plugin publication kit](plugin-publication/README.md). Its draft package is
separate from the currently deployed integration and is not ready to submit.

## Configure an isolated test environment first

Use a dedicated Convex deployment and frontend, with test Clerk credentials and
synthetic data. Do not point development commands at production or the usual
preview channel.

The current test targets, reproducible deployment commands, HTTPS smoke test,
and manual results are recorded in [the isolated environment runbook](chatgpt-mcp-test-environment.md).

Convex can be provisioned directly through its CLI/dashboard; the Vercel
Marketplace integration is optional. Keep that project's deployment selection
in a separate environment file and use `--env-file` for Convex commands. For a
new Vercel project, the first deployment may be assigned to its production
channel automatically. Explicitly select `--environment preview` when deploying
the test frontend, and verify its target and environment variables.

1. Install the pinned dependencies with `pnpm install --frozen-lockfile`.
2. Configure the frontend's `VITE_CONVEX_URL`, `CONVEX_DEPLOYMENT`, and
   `VITE_CLERK_PUBLISHABLE_KEY` for the test environment. Configure its Convex
   `CLERK_JWT_ISSUER_DOMAIN` as described in the main README.
3. Set `MCP_CONSENT_URL` on that Convex deployment to the frontend's full
   `/connect` URL, for example `https://your-test-app.example/connect`. This is
   the app URL, not the Convex HTTP origin. Keep it stable for OAuth callbacks.
4. Deploy the backend and frontend to those isolated targets. The MCP component
   needs its configuration/code generation; run Convex's normal codegen/dev flow
   rather than hand-editing generated files.
5. Sign in to the test frontend and open **Integrations**. Copy its displayed MCP
   URL, normally `https://<deployment>.convex.site/mcp`. OAuth discovery lives at
   the same Convex origin root, so do not add an app-level HTTP prefix.

The MCP HTTP and OAuth routes are disabled when `MCP_CONSENT_URL` is unset. The
deployment's ordinary Clerk-protected UI and nutrition APIs continue to work.
This release uses `@convex-dev/mcp@0.1.0-alpha.7`; review compatibility and the
component's bundled guidance before changing that version.

## Connect from ChatGPT

In ChatGPT Plugins, choose **Add custom MCP server**, paste the MCP URL, and use
OAuth authentication. Install/enable the resulting integration in a conversation.
Account/workspace policies may restrict custom connections.

## Connect from Claude

In Claude, open **Customize → Connectors**, choose **Add custom connector**, paste
the MCP URL, keep the default sign-in settings, and add it. Select **Connect** to
sign in, then turn the connector on from the chat **+** menu under
**Connectors**. On Team and Enterprise plans an organization Owner adds the
connector in **Organization settings → Connectors** first. The server supports
both Claude's published client identity (Client ID Metadata Document) and
dynamic client registration.

## Consent and permissions

Sign in to Calorie Counter when redirected. The consent screen shows the client
name as unverified, its return address, and the requested permissions. Approve
only a connection you started. Clerk sign-in stays on the current consent URL.

Permissions are `nutrition:read`, `meals:write`, and `cooking:write`.
`meals:write` also covers body weights and daily goals. Writing also
requires read access. A client requesting only `nutrition:read` can preview and
read but cannot save. Scope selection depends on the client's OAuth settings;
the consent page approves or denies the scope set the client requested.

Disconnect an agent from **Settings → AI assistants**. Revocation removes
its credentials without removing recorded meals or cooking. No personal API-key
creation or device-code flow is exposed in this release.

## What users can do

- Find usual foods in one call with `discover_foods`: saved products, ingredients,
  cooked batches, recipes, templates and meal/item history. Use the product name
  as `search` and pass known `brand` and `variant` separately. Known identity
  mismatches are excluded; unidentified products still need clarification.
- Search old meals without remembering their dates using `search_meal_history`.
  Both meal names and individual food names support indexed token/prefix search.
  Optional `personId` and `eatenOn` narrow results. Item and meal-name hits use
  separate cursor phases; follow non-null cursors even after an empty filtered
  page. Relevance and recency ranking apply within each page, not globally over
  the entire history. A meal can appear as both a meal and an item match.
- Use `preview_repeat_meal` for the entire original meal or selected item IDs.
  Each selection has a `multiplier`: 1 preserves its recorded portion, 0.5
  halves it. Omitted items are removed; `additions` supplies extra foods or an
  explicit product replacement. Historical nutrition, identity and provenance
  are reused, including archived catalog references, without changing the meal.
  Save the returned ordinary meal input through `log_meal` after the existing
  approval policy is satisfied. A source edit that replaces item IDs requires
  finding and previewing the source again; retries of successful saves retain
  their original receipt even if the source subsequently changes.
- Save a named combination with `save_meal_template` (`action: save`). Templates
  freeze nutritional snapshots and default quantities and retain source IDs.
  Current product edits do not update templates. Search with
  `search_meal_templates`, preview with `preview_meal_template`, and use the
  same approved `log_meal` save path. Optional full `items` replaces defaults;
  referenced replacement products resolve to new snapshots. Rename, edit or
  delete using `save_meal_template` with `action: edit|delete`, the current
  `expectedEditRevision`, and a new operation key. Catalog's **Meal templates**
  tab also manages names, quantities, product replacements and deletion.
- Templates report `missingMacros` (and `itemMacroStatus` per item) when
  logging them would record calories without macros; the app marks those
  templates “Some foods without macros”. `preview_meal_template_refresh`
  re-reads macros from each item's source (catalog ingredient or cooked batch,
  saved food, or the meal item it was saved from) and shows before/after per
  item. Only macros change, and only from a source whose calories still match
  the item's. Save the returned `action: refresh` input with
  `save_meal_template`; it fails if the sources changed since the preview.
- Record a body weight the user states with `record_weight`: kilograms, one per
  person per date, saved without a preview. Saving the weight already recorded
  changes nothing, so an uncertain save can be retried. A different weight for
  a date that already has one fails and names the recorded value; after the
  user confirms, call again with that entry's `editRevision` as
  `expectedEditRevision`. `get_weight_history` reads weights newest first, 30
  per page, with optional inclusive `startDate` and `endDate`. Weights are
  deleted only in the app, on the Weight page. Both tools use existing scopes
  (`nutrition:read` to read, `meals:write` to record), so a connection only
  needs a metadata refresh to see them.
- Read and change a person's daily calorie goal. `get_goal` returns the
  current goal and its `editRevision`, the saved calculator details
  (`energyProfile`) and goal plan, the last 10 goal changes, and the
  maintenance check-in the Weight page shows. `preview_goal_change` takes a
  goal the user states (`goalKcal`), or calculates one for a `goalPlan` (lose,
  maintain or gain at an offered weekly pace, with an optional target weight):
  from the check-in once it is ready, otherwise from the National Academies
  2023 equations and the latest weigh-in. `goalPlan: null` clears the plan.
  `set_goal` saves the exact previewed input after approval. A change applies
  from today, so earlier days keep their goals, and the previous goal stays in
  goal history. Saving a state already in place changes nothing, so an
  uncertain save can be retried; a stale `expectedEditRevision` fails instead
  of overwriting. Plans are for adults only, and a stated goal under
  1200 / 1500 kcal comes with a warning. Reading uses `nutrition:read` and
  saving `meals:write`, so a connection only needs a metadata refresh.
- The same goal tools read and set optional macro goals. `macroGoals` holds
  protein as grams a day (`proteinG`) or grams per kg of body weight
  (`proteinGPerKg`, from the latest weigh-in on or before each day), not both,
  plus `carbsG` and `fatG`. Sent alone, `macroGoals` keeps the calorie goal and
  adds no goal history; `null` clears them. Macro goals have no history, so
  they apply to every day read. Today shows macros only for a person with a
  macro goal.
- Assistants should record protein, carbohydrate and fat with the calories of
  every food: from the user's text, a nutrition label in a photo, a lookup, or
  an estimate labelled as one. The server enforces this for `customByWeight`
  and `fixedCalories` meal items, for every person: `preview_meal` (and the
  template and repeat previews built on it) marks each such item that has
  calories but no `macros` with a `missingMacros` warning, and `log_meal`
  refuses it with an error asking for an estimate. `fixedCalories` and
  `customNutrition` corrections follow the same rule in
  `preview_meal_correction` and `preview_meal_corrections_batch` (which then
  reports `ready: false`), and `correct_meal` and `correct_meals_batch` refuse
  them. Only when no estimate is possible, the item or change sets
  `macrosUnknown: true` and saves without macros.
- Add protein, carbohydrate and fat to a catalog ingredient, cooked batch or
  saved food. `preview_food_macros` takes grams on the food's calorie basis
  (per 100 of its unit, per 100 g of a batch's finished weight, or per serving
  for a fixed-calorie saved food) with a required
  `nutritionProvenance`, and returns the kcal they imply at 4/4/9 kcal per gram
  with a warning when that disagrees with the food's calories by more than 20%
  (or 20 kcal). More than 100 g per 100 g and foods whose calories are ignored
  are rejected. `set_food_macros` saves the exact previewed input after
  approval; a retry of a save already applied changes nothing, and a food that
  changed since the preview fails. `search_foods`, `discover_foods` and
  `get_food_details` return the stored `macros`. Changing an ingredient's
  calories in the app clears its macros. Reading uses `nutrition:read` and
  saving `meals:write`, so a connection only needs a metadata refresh.
- Fill those macros into past meals with `applyToPastMeals: true` (ingredients
  and cooked batches, up to 300 past items). The preview lists each item it
  would fill (meal, date, person, grams, resulting macros), each item it skips
  and why (`kcalMismatch` when the item recorded different kcal/100 g than the
  food has now, `ignoreCalories`, `hasMacros`, `alreadyCurrent`,
  `archivedMeal`, `customItem`), and each day's change in macro grams and
  `coveredCalories`. Past items gain macros only; calories, grams and
  provenance stay. `set_food_macros` then needs an `operationKey` and saves the
  food and every listed item in one transaction, counting as one write. If a
  listed meal's edit revision moved or a new meal with the food was logged,
  nothing is saved and the error names the meals. Past meal items do not
  record which saved food they came from, so saved foods cannot use it.
- Meals and cooking carry those macros forward. A meal item copies the macros
  of its ingredient, saved food or cooked batch, and `customByWeight` and
  `fixedCalories` items accept their own `macros` (per 100 g, or for the whole
  item). A cooked batch gets macros per 100 g only when every counted
  ingredient has them; otherwise `preview_cooking` lists the ingredients
  without macros in `missingMacros`. Meals, `get_day` and the preview summaries report
  `macros` with `coveredCalories`, the kcal of the foods that had macros, so a
  partial total is never read as the whole day. Meals logged before macros
  existed have none.
- Read `suggest_reusable_foods` for a logged meal. It offers at most five
  identifiable repeats supported by up to 50 matching item records per food,
  considering the first ten foods and the same person. It never saves anything;
  saving a product or template still needs explicit user approval. This bounded
  evidence can omit older occurrences and is not a complete usage counter.

Product `foodIdentity` records brand, variant, nutrition basis, serving label
and optional serving size. Names alone do not identify products. Saved-food
deduplication compares identity, nutrition and provenance, with a bounded legacy
fallback; operation receipts separately prevent retry duplication. One-off
custom nutrition leaves saved products and previous meals unchanged. Supplied
ingredient and meal values retain fractional kcal precision; existing cooked
batch rounding behavior is unchanged.

Provenance retains `kind: provided|estimate` and adds optional
`origin: label|database|generic` and `verifiedOn` (YYYY-MM-DD). Database sources
and dates are caller claims, not independent server verification. Missing kinds
remain unknown/estimated; reuse never upgrades their confidence.

These schema additions are optional on existing tables, plus the new
`mealTemplates` table and search indexes over existing meal/item names. No data
backfill or historical rewrite is required. Indexes must finish building after
the normal backend deployment before these tools are available. No deployment
to an existing environment is part of this implementation.

- Find ingredients, recipes, cooked batches, and explicitly saved reusable foods
  by name and inspect nutrition and composition.
- Read a person's meals, daily calorie total, and goal for an explicit date.
- Preview and record a meal from catalog foods, cooked portions, custom nutrition,
  or fixed calories.
- Preview and record a session with up to five outputs and 50 ingredients per
  output, then log portions using the returned cooked-food IDs.
- Remember logging defaults with `set_logging_preferences`: household, person,
  IANA timezone, and confirmation policy. Pass `preferences: null` to clear them.
  **Settings → AI assistants** can inspect, change, or reset the same account defaults,
  even when the browser's selected household is unavailable. Browser household
  and person selection remain independent.
- Save a logged food for reuse with `save_food_from_meal`, using IDs from
  `get_meal`. This copies historical nutrition into a household-scoped MCP saved
  food; it does not edit the meal or add an ingredient to the app catalog. Fixed
  foods use `portion: { servings: 1 }`. New fixed items record `servingCount`:
  a 200 kcal item representing two cookies becomes 100 kcal per saved serving.
  `sourceServings` can explicitly establish a legacy item's original count.
  Without either count, one serving remains the entire original portion; never
  guess that it meant one cookie. Weighted foods use `{ grams: 100 }`; volume
  products use `{ ml: 100 }` and retain their per-100-ml basis.
  Search with `kind: "savedFood"` and log with `sourceType: "savedFood"`. Cooked
  foods are already reusable and should keep their original batch IDs.
- Reuse a cooked batch as a cooking ingredient with `sourceType: "cookedFood"`,
  its `cookedFoodId`, and `consumedWeightGrams`. Preview resolves the cooked
  nutrition and preserves composition evidence in the new ingredient snapshot.
  Saving requires the returned expected snapshot and edit revision. A source
  composition over 50 lines or a resulting snapshot note over 2,000 characters
  must be simplified in the app; it is rejected rather than silently truncated.
- Save estimates with a stated source and assumptions. Labels persist in meal,
  cooked-food, and recipe-version snapshots; opening a meal or cooked food in the
  app shows the estimate information. `nutritionProvenance.kind` defaults to
  `estimate` for existing records; use `provided` for exact user/label values,
  retaining their stated source and basis. The app labels these as “Nutrition
  source”, not “Estimated”. Supplied sources are still unverified claims.
- Correct an existing meal's portions, custom calorie estimates, name, person,
  or date after reviewing before/after values. Unmentioned items and private
  notes are preserved, and moved meals update both affected daily summaries.
  Fixed-calorie corrections may include an explicit positive `servingCount`
  when correcting quantity. Calorie-only corrections keep the existing count;
  the server never infers servings from calories.
- Ingredient and cooked-batch items accept `{ kind: "macros", macros,
nutritionProvenance }` (per 100 g, or `null` to remove them) and
  `{ kind: "refreshFromCatalog" }`, which copies the catalog food's current
  macros only while its kcal/100 g equals the item's recorded value. Neither
  changes calories or grams; a portion change keeps the recorded macros.
- `preview_meal_corrections_batch` and `correct_meals_batch` take up to 50
  corrections (one per meal) as one approval and one operation key. The
  preview reports each meal's result or error and combined daily summaries;
  the save is all or nothing, listing every failing meal when any fails, and
  counts as one write against the rate limit.

Try: “Use Calorie Counter. Show my people, then log 250 g of the chili I cooked
yesterday for Alex's lunch. Preview it before saving.”

Ask for the person and timezone when ambiguous. Meal dates are local calendar
dates (`YYYY-MM-DD`); cooking timestamps are Unix milliseconds, accompanied by
the explicit local cooking date. Ingredient meals require grams. Cooking's
`countedAmount` is in the ingredient's calorie basis unit; reference quantities
alone do not establish a conversion from cans, bowls, or spoons.

The default `confirmationMode: "always"` shows a preview and asks before saving.
Only the user can turn on `explicitOnly`, in **Settings → AI assistants**. The
assistant can keep it when it is already on but cannot turn it on. With it, fully specified,
non-estimated new meals that the user asks to log can be previewed and saved in
the same turn. Estimates, cooking, corrections, and
transfers between households always require review and approval. Missing or
archived person defaults revert to the conservative confirmation behavior.
Clarify material ambiguity (for example single versus double toast slices) and
prefer measured weights over photo estimates. The assistant's own write
confirmation settings can be changed by the user; previews and model-provided
booleans are not independent proof of human approval. Server-side scopes,
ownership checks, numeric validation, and snapshot checks always apply.

Use `get_day` to find a meal, `get_meal` to inspect it, then
`preview_meal_correction` and `correct_meal` to review and save a correction.
Read the meal again for every new correction: its edit revision changes after
editing. Corrected items keep their IDs. Concurrent changes require a fresh preview and approval.
Retries reuse the exact input and operation key, even after a successful edit.

MCP cannot add, remove, or replace foods within an existing meal, archive/delete
meals, delete weights, change goals, alter recipes, or save new catalog entries. Use the app for
those changes and catalog management. Nutrition
sources stated by an assistant are claims, not verified database lookups.

The app's primary navigation is **Today**, **History**, and **Settings**. Open
meal details on Today before editing. Settings links to people/goals, household
access, the food library, and cooked batches. To correct a cooked batch's finished weight, read `get_food_details` with
`kind: "cookedFood"`, then pass its `editRevision` as `expectedEditRevision` to
`preview_cooked_food_weight_correction` with the desired positive
`finishedWeightGrams`. Show the before/after weight and calorie density and obtain
approval, then call `correct_cooked_food_weight` with the exact preview input and
a unique `operationKey`. Retry with the same input and key after an uncertain
outcome. Concurrent changes require fresh details, preview, and approval.
This updates the same batch without duplicating it. Ingredients, total batch
calories, existing meals, and downstream cooking snapshots stay unchanged;
future portions use the corrected calorie density. Other cooking edits remain
in the app. The existing `cooking:write` permission covers weight corrections.

Reusable foods have a separate list in **Settings → Food library**. Archive an
incorrect entry and explicitly save a corrected replacement through MCP.
Archiving removes it from tool discovery and rejects fresh preview/save attempts;
restoring makes it reusable again. Past meal snapshots remain unchanged, and an
already completed operation still replays its original receipt. Existing saved
foods remain active without a backfill; the archive fields are additive.

## Reliability and data handling

Commits use the exact input returned by preview. Changed nutrition snapshots or
archived sources require a new preview. Each intentional save needs a unique
`operationKey`; retries reuse the same key and input. Replays return the first
result, and changed inputs with the same key fail. The receipt and the nutrition
write commit in one transaction, including all cooking outputs or the meal's
daily-summary adjustment. Previews return current and projected server daily
summaries; saves return the resulting summary. Correction previews and saves
include both days when a meal moves. Summaries have a `capturedAt` timestamp: a
replayed receipt returns the original point-in-time summary, not a fresh daily
read. Old receipts without summary fields remain replayable. Use `get_day` for
the current state.

Several meals are separate operations. Keep each approved input and operation
key, report any partial completion, and retry uncertain saves with their original
keys before proceeding. Never claim that a partially completed set was rolled
back or save successful entries again with new keys.

Writes are limited per owner to 30 per minute with a burst capacity of 10. Meal
requests allow 30 items; write/preview inputs are capped at 64,000 characters.
Search and day lists are paginated. The receipt stores bounded operation inputs
and result IDs for retry handling; it does not store the assistant conversation.

Food names, composition, portions, estimate assumptions, and daily totals returned
by tools are shared with the connected assistant. Tools omit owner identifiers,
Clerk credentials, unrelated private notes, and internal document metadata. No
tool sends information to an arbitrary model-supplied URL. Inspect your assistant provider's account/workspace data settings separately.

## Verification and rollout

`convex/mcp.test.ts` exercises MCP HTTP requests, OAuth/PKCE, scoped discovery,
revocation, valid foreign IDs, previews, retries/concurrency, summaries, atomic
cooking, and estimate preservation. UI tests cover explicit approval/denial,
expired requests, disconnect failures, and estimate display. Playwright covers
the new routes alongside the existing authenticated smoke flow.

Before real-user rollout, connect the isolated HTTPS environment from the actual
ChatGPT account and exercise:

1. Approve, deny, disconnect, and reconnect.
2. Find a food with multiple matches and select the correct batch.
3. Log a meal, retry its save, and inspect the app's daily total.
4. Record cooking, log a portion, and inspect both records.
5. Review an estimate and confirm its source/assumptions remain visible in the app.
6. Decline a save, resolve a missing portion/finished weight, and check a relative
   date near midnight in the chosen timezone.

The synthetic [conversation evaluation cases](chatgpt-mcp-evaluation.md) cover
cooked-food reuse, persistent context, pending-meal changes, corrections, supplied
nutrition versus estimates, and interrupted multi-meal saves. HTTP tests exercise
the tool contracts; actual ChatGPT tool-selection checks remain a separate manual
evaluation and must be recorded as run or not run.

### Release and refresh existing ChatGPT connections

1. Merging to `main` deploys the Convex schema and functions with the
   frontend: the `buildCommand` in `vercel.json` runs `convex deploy`. Confirm
   the production deployment finished before relying on the live MCP backend.
   Version 1.2.0 adds tables and optional fields; it does not require a data
   backfill or credential replacement. Version 1.7.0 adds `get_goal`,
   `preview_goal_change` and `set_goal` on existing scopes; it needs only a
   metadata refresh. Version 1.8.0 adds `preview_food_macros` and
   `set_food_macros` and optional catalog `macros` fields, also on existing
   scopes with no backfill. Version 1.9.0 carries macros into meals, cooked
   batches and daily totals, and macro goals to the goal tools; it needs only
   a metadata refresh.
2. For each separately created personal ChatGPT connection, open **Plugins**,
   select the existing Calorie Counter connection, and choose **Refresh**. Verify
   that `set_logging_preferences` and `save_food_from_meal` are advertised.
3. Start a new conversation and enable the plugin. Set the desired defaults, for
   example: “Remember Home, Alex, Europe/Budapest, and always ask before saving.”
   The stored defaults then apply across conversations and connections for that
   same Calorie Counter account. They are not inferred from browser selection.
4. No OAuth disconnect/recreation is needed for a normal metadata refresh. These
   tools reuse existing scopes: `meals:write` also covers reusable-food saves and
   logging preferences. A read-only grant remains read-only. If a connection
   lacks a needed scope, authorize the additional permissions; metadata refresh
   cannot grant scopes. Different accounts set their own defaults.

A new conversation alone is insufficient for changed tool schemas, descriptions,
or server instructions. OpenAI explicitly documents server deployment followed by
connection refresh and a new conversation in its
[refresh procedure](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata),
with the metadata fetched by Refresh described in the
[custom MCP guide](https://developers.openai.com/api/docs/guides/custom-mcp-server#how-to-use).
Those sources do not establish universal refresh propagation for every shared
workspace connection; verify the new tools in the connection each person uses.

Production activation is a separate release action. Preserve existing data when
rolling back: disable the MCP routes by unsetting the consent URL, revoke
connections when appropriate, and leave historical snapshots intact.

Official references: [ChatGPT MCP connections](https://developers.openai.com/api/docs/guides/custom-mcp-server),
[Claude custom connectors](https://claude.com/docs/connectors/custom/remote-mcp),
[Convex MCP component](https://www.convex.dev/components/mcp).

## Household access

An MCP connection belongs to an account and can access its current household
memberships, within its granted scopes. This includes households the account
joins later; the consent page explains that access. Each tool call checks live
membership, including idempotent retries, so removing a household member
immediately removes the connection's access to that household. Existing
connections initialize and migrate their original household on their first tool
call, including discovery and reads, without needing a browser visit. This
transactional bootstrap never restores a removed membership.

Use `list_households` to discover choices, ask which household the user means,
and pass `householdId` to nutrition tools. Omitting it uses explicitly saved MCP preferences, or the account's original
personal household when no preferences exist; browser selection never changes
an MCP connection's target. Read, preview, and meal/cooking save responses include resolved context.
An explicit household overrides saved defaults without importing a person from
another household. If membership in the remembered household is removed, calls
refuse access and request a new selection; they never silently fall back.
Use `get_logging_context` in a fresh conversation to retrieve defaults and the
current local date. Ask only for missing or ambiguous choices. Preferences can
be reset with `set_logging_preferences` even after the old membership is gone.
Receipts saved before households existed remain replayable in the account's
original household. A matching retry attaches the household to the receipt and
returns its original result, without repeating the nutrition write. Replays in
another household and changed inputs are rejected.
People are shared household records, not authenticated accounts. New operation
links include the household so another device opens the right context.
