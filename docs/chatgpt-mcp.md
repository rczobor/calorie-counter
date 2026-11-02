# ChatGPT integration

Calorie Counter exposes an authenticated MCP server for ChatGPT. ChatGPT provides
the model and conversation; the app does not call an LLM API or need an OpenAI
API key. The same tools can be used by other compatible MCP clients.

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

Sign in to Calorie Counter when redirected. The consent screen shows the client
name as unverified, its return address, and the requested permissions. Approve
only a connection you started. Clerk sign-in stays on the current consent URL.

Permissions are `nutrition:read`, `meals:write`, and `cooking:write`. Writing also
requires read access. A client requesting only `nutrition:read` can preview and
read but cannot save. Scope selection depends on the client's OAuth settings;
the consent page approves or denies the scope set the client requested.

Disconnect an agent from **Integrations → Connected agents**. Revocation removes
its credentials without removing recorded meals or cooking. No personal API-key
creation or device-code flow is exposed in this release.

## What users can do

- Find ingredients, recipes, cooked batches, and explicitly saved reusable foods
  by name and inspect nutrition and composition.
- Read a person's meals, daily calorie total, and goal for an explicit date.
- Preview and record a meal from catalog foods, cooked portions, custom nutrition,
  or fixed calories.
- Preview and record a session with up to five outputs and 50 ingredients per
  output, then log portions using the returned cooked-food IDs.
- Remember logging defaults with `set_logging_preferences`: household, person,
  IANA timezone, and confirmation policy. Pass `preferences: null` to clear them.
  **Settings → ChatGPT** can inspect, change, or reset the same account defaults,
  even when the browser's selected household is unavailable. Browser household
  and person selection remain independent.
- Save a logged food for reuse with `save_food_from_meal`, using IDs from
  `get_meal`. This copies historical nutrition into a household-scoped MCP saved
  food; it does not edit the meal or add an ingredient to the app catalog. Fixed
  foods use `portion: { servings: 1 }`, where one saved serving is the entire
  originally logged item (which may span multiple package servings); clarify the
  intended reusable portion before saving or reusing it. Weighted foods use
  `{ grams: 100 }`.
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

Try: “Use Calorie Counter. Show my people, then log 250 g of the chili I cooked
yesterday for Alex's lunch. Preview it before saving.”

Ask for the person and timezone when ambiguous. Meal dates are local calendar
dates (`YYYY-MM-DD`); cooking timestamps are Unix milliseconds, accompanied by
the explicit local cooking date. Ingredient meals require grams. Cooking's
`countedAmount` is in the ingredient's calorie basis unit; reference quantities
alone do not establish a conversion from cans, bowls, or spoons.

The default `confirmationMode: "always"` shows a preview and asks before saving.
A user may explicitly choose `explicitOnly` after its behavior is explained:
fully specified, non-estimated new meals that the user asks to log can be
previewed and saved in the same turn. Estimates, cooking, corrections, and
transfers between households always require review and approval. Missing or
archived person defaults revert to the conservative confirmation behavior.
Clarify material ambiguity (for example single versus double toast slices) and
prefer measured weights over photo estimates. ChatGPT's own write
confirmation settings can be changed by the user; previews and model-provided
booleans are not independent proof of human approval. Server-side scopes,
ownership checks, numeric validation, and snapshot checks always apply.

Use `get_day` to find a meal, `get_meal` to inspect it, then
`preview_meal_correction` and `correct_meal` to review and save a correction.
Read the meal again for every new correction: its edit revision and item IDs
change after editing. Concurrent changes require a fresh preview and approval.
Retries reuse the exact input and operation key, even after a successful edit.

MCP cannot add, remove, or replace foods within an existing meal, archive/delete
meals, change goals, alter recipes, or save new catalog entries. Use the app for
those changes and catalog management. Nutrition
sources stated by an assistant are claims, not verified database lookups.

The app's primary navigation is **Today**, **History**, and **Settings**. Open
meal details on Today before editing. Settings links to people/goals, household
access, the food library, and cooked batches. Cooking inspection and corrections
remain in the app; ordinary new cooking is recorded through MCP.

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
and result IDs for retry handling; it does not store the ChatGPT conversation.

Food names, composition, portions, estimate assumptions, and daily totals returned
by tools are shared with the connected assistant. Tools omit owner identifiers,
Clerk credentials, unrelated private notes, and internal document metadata. No
tool sends information to an arbitrary model-supplied URL. Inspect OpenAI's
account/workspace data settings separately.

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

1. Deploy the merged Convex schema/functions to the intended deployment through
   the approved release process. Merge alone does not prove that the live MCP
   backend has been updated. Version 1.2.0 adds tables and optional fields; it
   does not require a data backfill or credential replacement. Deploy the
   frontend too so supplied nutrition receives the updated source label.
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
