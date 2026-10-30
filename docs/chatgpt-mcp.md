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

- Find ingredients, recipes, and cooked batches by name and inspect composition.
- Read a person's meals, daily calorie total, and goal for an explicit date.
- Preview and record a meal from catalog foods, cooked portions, custom nutrition,
  or fixed calories.
- Preview and record a session with up to five outputs and 50 ingredients per
  output, then log portions using the returned cooked-food IDs.
- Save estimates with a stated source and assumptions. Labels persist in meal,
  cooked-food, and recipe-version snapshots; opening a meal or cooked food in the
  app shows the estimate information.
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

The assistant should show the preview and ask before saving. ChatGPT's own write
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

## Reliability and data handling

Commits use the exact input returned by preview. Changed nutrition snapshots or
archived sources require a new preview. Each intentional save needs a unique
`operationKey`; retries reuse the same key and input. Replays return the first
result, and changed inputs with the same key fail. The receipt and the nutrition
write commit in one transaction, including all cooking outputs or the meal's
daily-summary adjustment.

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

Production activation is a separate release action. Preserve existing data when
rolling back: disable the MCP routes by unsetting the consent URL, revoke
connections when appropriate, and leave historical snapshots intact.

Official references: [ChatGPT MCP connections](https://developers.openai.com/api/docs/guides/custom-mcp-server),
[Convex MCP component](https://www.convex.dev/components/mcp).
