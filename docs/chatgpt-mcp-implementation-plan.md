# ChatGPT MCP integration implementation plan

Status: Implemented and deployed to an isolated HTTPS test environment with a
separate Convex development project and Clerk test instance. Automated, local
backend, and real HTTPS browser verification are complete, including Clerk
sign-in, OAuth approval/token exchange, meal save/retry, estimate display, and UI
revocation. Robi also verified the actual ChatGPT connection, meal logging,
read-back, cooking/portions, missing information, and cancellation. Manual
disconnect/reconnect is deferred at his request. The approved meal-correction
follow-up is implemented and deployed to the isolated backend; the real HTTPS
test verified correction, retry behavior, daily totals, and estimate display.
Robi subsequently confirmed that meal correction also worked in ChatGPT.
See `docs/chatgpt-mcp.md` and the isolated environment runbook for the current
contract and verification. The initial plan below records the original scope.

## Delivered meal-correction follow-up

`get_meal`, `preview_meal_correction`, and `correct_meal` support correcting
portions, custom calorie estimates, meal name, person, and date. Corrections
patch specified items, preserve the rest and their private notes, and reuse the
existing UI edit invariants. Preview is read-only; saving uses `meals:write`, a
fresh edit revision, and an atomic retry receipt. Catalog nutrition remains a
historical snapshot. Food replacement/removal and archival stay in the app.

## Goal and decisions

Let an owner connect Calorie Counter to ChatGPT, describe meals and cooking in
natural language, review the interpretation, and save through the app's existing
domain rules. ChatGPT supplies the model and conversation. Calorie Counter
supplies authenticated tools, deterministic nutrition calculations, and storage.

Keep this MCP integration when adding an in-app assistant later. Future Sign in
with ChatGPT support should reuse the domain operations, without requiring an
agent framework or provider abstraction now.

Initial delivery is a private custom MCP connection. Public directory submission,
an embedded ChatGPT widget, an in-app chat, a standalone CLI, external nutrition
lookup, and catalog/recipe/goal editing are outside this plan. Existing UI flows
remain available for corrections and catalog management.

## Current integration points

- `convex/lib/auth.ts` derives ownership from Clerk's verified
  `identity.tokenIdentifier`; no application users table is necessary today.
- `convex/nutrition.ts` owns meal, cooking, recipe, archive, and summary write
  invariants. Its public mutations currently authenticate through `ctx.auth`.
- `convex/{catalog,cooking,meals,people,recipes}.ts` provide owner-scoped reads,
  search, pagination, and details. Reuse these access patterns.
- Meal inputs already support ingredients, cooked foods, custom food by weight,
  and fixed calories. Direct ingredient meal entries require a gram calorie basis.
- Cooked food requires finished weight and preserves ingredient composition.
- Authenticated frontend routes use `ssr: false` and live Convex subscriptions.
  Keep the connection and consent screens within that established boundary.

## Architecture and authorization

ChatGPT calls a Streamable HTTP endpoint at the Convex HTTP origin's `/mcp`.
Prefer `@convex-dev/mcp` for protocol handling, OAuth, connection management, and
revocation. Its published setup currently references an alpha release: validate
the actual package and pin the tested version before relying on it.

An owner follows ChatGPT's connection flow, signs in through the existing Clerk
UI, reviews requested permissions, and approves or denies the connection. Return
the exact existing `identity.tokenIdentifier` from the component's authenticated
user resolver. Do not create a second owner identity from email, a ChatGPT ID, or
an unqualified Clerk subject.

MCP tool handlers receive a verified connection actor; they do not automatically
receive a Clerk `ctx.auth` identity. Pass that actor only to internal Convex
functions, enforce the tool's scope there, and use its verified owner identifier
for every record and relationship lookup. Never expose a public function that
accepts an owner argument as proof of authorization.

Keep existing public UI queries and mutations authenticated with
`requireAuthenticatedUser`. Extract only the domain helpers needed by both
entry points; UI wrappers derive the owner from Clerk, MCP wrappers derive it
from the verified connection. Both call the same validation and persistence
logic. Do not duplicate the contents of `createMeal` in an MCP handler or weaken
the existing authentication helper to accept model-supplied identity.

Proposed scopes:

| Scope            | Permission                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| `nutrition:read` | Read the owner's people, food/recipe details, meals, and daily summaries |
| `meals:write`    | Create meals; requires the reads used to prepare them                    |
| `cooking:write`  | Record new cooking; requires the reads used to prepare it                |

Authorize read access separately from either write capability. Scope checks
belong at the internal operation boundary as well as in tool registration.
Connection approval grants a capability; it is distinct from reviewing an
individual meal. Support viewing connections and revoking one's own connection.
Follow the component's documented token lifetime and revocation behavior and test
it; do not promise stronger revocation semantics than the tested implementation.

## Proposed tool contracts

Use bounded inputs and outputs, explicit argument/return validators, structured
results, and accurate read-only/destructive/open-world annotations. Names below
are the proposed contract, subject to the compatibility milestone.

| Tool                  | Inputs and output                                                                                                                                                      | Scope / milestone |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `get_logging_context` | Paginated active people; supplied IANA timezone can produce an explicit local date and timestamp context. No assumed mapping from owner to person.                     | Read / 1          |
| `search_foods`        | Search text, food kind, optional cooking date range, bounded pagination. Return ingredient, cooked-food, or recipe candidates with typed IDs and relevant dates/units. | Read / 2          |
| `get_food_details`    | Kind plus ID. Return nutrition and composition needed to log a portion or prepare cooking; include the selected recipe version when applicable.                        | Read / 2          |
| `get_day`             | Person ID and calendar date. Return meals, totals, and effective goal using the existing goal-history rules. Paginate meal details if necessary.                       | Read / 2          |
| `preview_meal`        | Person, date, optional name, and typed item inputs. Return normalized items, calculated calories, source snapshots, and errors/assumptions. No persisted draft.        | Read / 2          |
| `log_meal`            | Reviewed meal inputs, expected source snapshots, and a unique operation key. Atomically create the meal, snapshots, summary adjustment, and operation receipt.         | Meal write / 2    |
| `preview_cooking`     | Explicit cooking date/time, session information, outputs, ingredient quantities, and finished weights. Return calculated composition and calories. No writes.          | Read / 3          |
| `log_cooking`         | Reviewed cooking inputs, expected source snapshots, and a unique operation key. Atomically create or extend a session and create all requested outputs.                | Cooking write / 3 |

Keep preview and commit validation/calculation shared. Saving must revalidate
ownership, archive state, units, and the expected nutrition snapshots. If a source
changed since preview, require a fresh preview instead of silently saving different
nutrition. A preview is useful UX, not authorization or proof of human approval.

Require explicit person IDs and calendar dates at the tool boundary. ChatGPT can
resolve names and relative dates from user-confirmed context; it must ask when
the person, timezone, batch, portion, raw/cooked basis, or unit conversion is
ambiguous. Do not interpret “me” as the first person or “today” as the server's UTC
date. Do not add persistent default-person/timezone settings just for v1.

## Delivery milestones

### 1. Prove connection and read access

- Install and inspect the exact MCP component version, including its bundled
  implementation and security guidance. Confirm compatibility with the pinned
  Convex version before upgrading anything else.
- Add component configuration, HTTP routing, a Clerk-authenticated `/connect`
  consent page, and a small `/settings/integrations` page with the endpoint,
  setup instructions, connected agents, and disconnect controls.
- Keep OAuth discovery at the Convex origin root. Configure a trusted frontend
  consent URL; do not derive it from request headers. Preserve the authorization
  request through sign-in. Show requested scopes and label client-provided names
  appropriately. Prevent consent-page framing.
- Use the normal browser OAuth flow. Disable optional device-flow/API-key
  surfaces unless required by the tested ChatGPT connection; do not expose
  unused authentication options.
- Expose only `get_logging_context`, returning a minimal, bounded DTO.
- Test in an isolated deployment with synthetic data and two test owners, then
  connect it from ChatGPT and exercise approve, deny, reconnect, and revoke.

Exit condition: the actual ChatGPT client discovers and calls the tool for the
correct owner, another owner's records are inaccessible, and revocation behaves
as documented. If the alpha package cannot meet this, record the concrete issue
and reassess the component/transport choice before building the remaining tools;
do not silently build a custom OAuth server.

### 2. Deliver reliable meal logging

- Extract the minimal shared read and meal-write helpers while preserving the
  existing UI API contracts and tests.
- Add food search/detail, day reads, meal preview, and meal commit. Begin with
  existing catalog/cooked foods and user-supplied custom nutrition values.
- Add an indexed operation receipt table scoped by owner, connection, operation
  kind, and operation key. Store canonical normalized inputs and result IDs.
  Commit the receipt with the domain write in the same transaction.
- A replay with the same key and inputs returns the existing result; the same
  key with different inputs fails. Concurrent replays must produce one write
  and one summary adjustment. Distinct keys may intentionally record identical
  meals; do not deduplicate by food description or calories.
- Return concise item/total confirmation and a link to the relevant app date.
  Supply metadata so the existing UI can identify an MCP-created record when
  investigating a reported mistake, without storing full conversations.
- Annotate commits as writes. Instruct ChatGPT to present person, date, portions,
  and calories before saving. Verify actual ChatGPT confirmation behavior and
  document that users can change approval settings; a boolean argument from the
  model is not independent evidence of consent.

Exit condition: a user can log a meal in ChatGPT, see it immediately in the app,
and verify the daily summary, including after a retried request. Correction is
through the existing UI in this release.

### 3. Add cooking and reuse of batches

- Add cooking preview/commit using the same ingredient validation, recipe-version
  selection, snapshotting, and calorie calculations as the UI.
- Support one session producing multiple outputs, or adding outputs to an
  explicitly selected active session. Check every related ID for ownership.
- Create the session and outputs in one mutation so a failed ingredient line
  cannot leave an empty session or partially saved batch. Reuse the scoped
  operation receipt pattern for retries.
- Require finished weight per output. Ask for missing package weights and
  conversions rather than treating a can, bowl, or tablespoon as a fixed gram
  quantity. Preserve the existing counted-amount rules for other calorie bases.
- Allow selecting an existing recipe version, but keep saving new recipes and
  modifying the shared catalog in the existing UI.
- Return each cooked-food ID so the conversation can immediately log a portion
  through the meal tools.

Exit condition: “I cooked this batch, then ate 250 g” produces a complete cook
session and a meal referencing the correct cooked food. Invalid multi-output
cooking rolls back completely; retries do not create duplicate batches.

### 4. Add explicitly labelled estimates

- Let ChatGPT propose approximate values for unknown foods or portions, clearly
  showing assumptions for user review. The backend validates and calculates;
  it does not make its own LLM call or certify the estimate's accuracy.
- Add optional nutrition provenance to relevant historical snapshots: whether a
  value was estimated, its stated source, and bounded assumptions. Missing
  provenance on existing records means unspecified, not verified accuracy.
- Support estimates through custom meal/cooking inputs. Keep automatic
  `saveToCatalog` and `saveAsRecipe` disabled for MCP writes, so guesses do not
  silently become reusable catalog facts.
- Preserve provenance through existing UI edits and historical reads. Show an
  estimate label and assumptions on meal and cooking detail surfaces; propagate
  an estimated cooking source to a subsequently logged meal.
- Add fields compatibly as optional, update input validators/DTOs and snapshot
  transformations together, and test old records. No backfill is needed merely
  to mark previously unknown provenance.
- Defer a separate external nutrition lookup tool until there is evidence it is
  needed. Described sources are claims, not independently verified references.

Exit condition: an estimated restaurant meal and a meal from an estimated batch
remain visibly estimated after saving, reloading, and editing through the UI.

## Expected code changes

Use existing modules where the helper naturally belongs. The likely additions
are `convex/convex.config.ts`, `convex/http.ts`, `convex/mcp.ts`, a small internal
MCP operations module, focused tests, and frontend connection/consent screens
under `src/routes` and `src/features/integrations`.

Modify `convex/lib/auth.ts` only for shared trusted-actor handling;
`convex/nutrition.ts` for reusable meal/cooking operations; applicable query
modules for shared read helpers; and `convex/schema.ts`/`convex/validators.ts` for
operation receipts and optional estimate provenance. Update relevant UI detail
adapters and documentation. Do not hand-edit generated files.

Avoid a generic action dispatcher, a parallel REST backend, copied nutrition
logic, stored conversation history, or a persisted proposal/workflow engine.
Keep future assistant integration possible by retaining ordinary domain helper
arguments and results beneath the MCP adapter.

## Verification and release

Focused automated coverage should prove:

- Cross-owner rejection for direct and related IDs, missing authentication,
  insufficient scopes, and unauthorized connection management.
- Preview and commit calculations agree; stale/archived sources are rejected.
- Meal totals and daily summaries remain correct under replay and concurrency.
- Cooking writes are atomic, reference the selected recipe version, and preserve
  composition when later catalog changes occur.
- Invalid dates, timezone context, non-finite values, wrong units, excessive
  arrays, and ambiguous inputs produce useful errors rather than silent defaults.
- Estimates retain their label and assumptions, including through UI edits and
  consumption of a cooked batch; older records remain readable.
- Tool DTOs exclude owner identifiers, credentials, and unrelated personal notes.
- Consent UI handles loading, error, denial, keyboard access, sign-in return,
  and expired requests. Tool annotations match behavior.

Run the repository lint, typecheck, unit tests, build, and formatting checks for
implementation changes; run the relevant Playwright flows and existing CI
coverage checks. Validate component configuration against an explicitly isolated
Convex deployment. Use its bundled component tests and metadata lint where
available.

Maintain a short manual ChatGPT evaluation set: existing food, two matching
batches, unknown person, relative date near midnight, missing portion weight,
user-declined save, repeated save request, changed nutrition source, estimated
food, cooking with missing finished weight, and a meal from the new batch. Verify
actual persisted data and app totals, not just the assistant's response.

Before enabling real users, verify OAuth discovery, redirect behavior, token
expiry/refresh/revocation, output minimization, and bounded tool reads/writes.
The component's public endpoint protections do not necessarily rate-limit tool
execution; check the tested version and add per-owner/connection limits with
`@convex-dev/rate-limiter` if needed. Avoid logging tokens or full food histories.
Document data shared with ChatGPT, setup, disconnect, usage limits, and recovery.

All implementation verification uses synthetic data and isolated environments.
Production deployment and connecting real data are separate, explicit release
actions. Do not modify production, the daily-driver preview, or existing live
connections while implementing this plan. Rollback disables the MCP route and
new consent/connection entry points; handle active credentials through the
component's revocation mechanism and leave recorded nutrition history intact.

## Sources and remaining checks

Reviewed on 2026-10-29:

- [Convex MCP component](https://www.convex.dev/components/mcp): proposed package,
  verified actor handoff, OAuth/connection APIs, and current limitations. The
  capability catalog was unreachable during planning, so this plan uses the
  published component documentation. Package source/API compatibility still
  needs verification in milestone 1.
- [OpenAI custom MCP server guide](https://developers.openai.com/api/docs/guides/custom-mcp-server):
  custom connections, authentication choices, tool metadata, and configurable
  write confirmations.
- [OpenAI connection testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt):
  real-client tool discovery and end-to-end evaluation. Recheck the actual
  account/workspace's connection availability during milestone 1.
- `AGENTS.md` and `docs/adr/0001-client-only-tanstack-start.md`: owner isolation,
  historical nutrition, client-only routes, verification, and release boundaries.

No decision on Sign in with ChatGPT eligibility is needed for this integration.
Revisit that separately when adding in-app inference; keep MCP as a supported
entry point regardless of that future choice.
