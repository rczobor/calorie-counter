# MCP metadata audit

Source review: 2026-11-05, `convex/mcp.ts`, server version 1.3.0, with
`@convex-dev/mcp@0.1.0-alpha.7`. This is a local source audit, not a production
scan or an OpenAI approval. Recheck deployed `tools/list` before submission.

## Annotation justifications

R = `readOnlyHint`; D = `destructiveHint`; O = `openWorldHint`;
I = `idempotentHint`. Values below match the current source. Paste or adapt the
justifications to the portal's scanned tool findings; this document does not
override server metadata.

| Tool                      | Scope            | R/D/O/I | Justification                                                                                                                                                                                                                         |
| ------------------------- | ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_logging_context`     | `nutrition:read` | T/F/F/T | Reads accessible people, defaults, local date, and household context. Does not log food. Results vary with time and membership; idempotent does not mean identical results. See bootstrap caveat below.                               |
| `list_households`         | `nutrition:read` | T/F/F/T | Lists only current memberships; does not change selection or membership.                                                                                                                                                              |
| `search_foods`            | `nutrition:read` | T/F/F/T | Bounded search in one authorized household; no external food lookup or catalog mutation.                                                                                                                                              |
| `get_food_details`        | `nutrition:read` | T/F/F/T | Reads the selected household-scoped food, recipe version, or batch composition.                                                                                                                                                       |
| `get_day`                 | `nutrition:read` | T/F/F/T | Reads a person's date-scoped meals and derived calorie summary. Repetition creates no meal.                                                                                                                                           |
| `get_meal`                | `nutrition:read` | T/F/F/T | Reads current meal items/revision; omits private notes.                                                                                                                                                                               |
| `preview_meal`            | `nutrition:read` | T/F/F/T | Validates and calculates snapshots and projected totals without saving the meal.                                                                                                                                                      |
| `preview_cooking`         | `nutrition:read` | T/F/F/T | Calculates batch composition and density without saving cooking or meals.                                                                                                                                                             |
| `preview_meal_correction` | `nutrition:read` | T/F/F/T | Calculates proposed changes and affected daily totals without editing the meal.                                                                                                                                                       |
| `log_meal`                | `meals:write`    | F/F/F/T | Adds one meal and updates derived totals. Exact input/key retries return its receipt instead of adding another meal. A new key represents a new intentional operation.                                                                |
| `log_cooking`             | `cooking:write`  | F/F/F/T | Adds a session/output batch atomically, preserving composition. It does not replace recipes or log the batch as a meal. Exact retries replay the receipt.                                                                             |
| `correct_meal`            | `meals:write`    | F/T/F/T | Replaces specified existing portions/values or context, so destructive is true despite no archive/delete. Checks the current revision, preserves unspecified fields, and updates totals atomically. Exact retries replay the receipt. |
| `save_food_from_meal`     | `meals:write`    | F/F/F/T | Adds a reusable copy from historical nutrition without editing its source meal or overwriting a catalog entry. Exact retries replay the receipt.                                                                                      |
| `set_logging_preferences` | `meals:write`    | F/T/F/T | Overwrites or clears account defaults, including confirmation policy, across connections. Repeating the same preference assignment is idempotent.                                                                                     |
| `search_meal_history`     | `nutrition:read` | T/F/F/T | Searches household-scoped historical meal and item names with pagination; does not copy or modify meals.                                                                                                                              |
| `preview_repeat_meal`     | `nutrition:read` | T/F/F/T | Calculates a new meal from preserved historical snapshots without saving it or altering the source.                                                                                                                                   |
| `discover_foods`          | `nutrition:read` | T/F/F/T | Bounded discovery across authorized foods, templates, and meal history; returns independent pagination cursors and saves nothing.                                                                                                     |
| `save_meal_template`      | `meals:write`    | F/T/F/T | Saves, edits, or deletes reusable templates after approval and revision checks. Edits can replace the complete composition, so destructive is true. Existing meals remain unchanged; exact retries reuse the receipt.                 |
| `search_meal_templates`   | `nutrition:read` | T/F/F/T | Searches active templates in the selected household without updating their snapshots.                                                                                                                                                 |
| `preview_meal_template`   | `nutrition:read` | T/F/F/T | Previews a selected template for a person/date without saving; normal meal logging performs the eventual write.                                                                                                                       |
| `suggest_reusable_foods`  | `nutrition:read` | T/F/F/T | Reads bounded repeated-food evidence and proposes candidates without saving products or templates.                                                                                                                                    |

Every tool has O=false because it operates on the application's bounded
household/account data. Food names, recipe instructions, and provenance are
untrusted data, not destinations for outgoing network requests. OAuth calls to
the application's authorization service are part of connection setup, not an
open-world nutrition tool.

## Contracts checked in source

- All 21 tools declare input/return validators, scopes, and the four annotations.
  Public input IDs do not substitute for membership or relationship checks.
- DCR, authorization code + S256 PKCE, and refresh are implemented by the pinned
  component. Token client authentication is `none`; it is a public OAuth client,
  not an API-key integration or a Clerk OAuth client secret.
- The package requests read access plus meal/cooking writes. Read access is
  required by backend write paths. Test actual requested/granted scopes after
  upload; the package alone does not establish portal behavior.
- Inputs use explicit local calendar dates and person IDs. Tool metadata
  distinguishes cooking timestamps, grams, counted amounts, and finished weight.
- Preview/commit uses expected snapshots and revisions; receipt keys are scoped
  to the authenticated account and connection. Server totals are authoritative.
- Supplied nutrition is marked `provided` with its claimed source; estimates
  retain assumptions. Neither source text nor a model boolean proves accuracy or
  independent human approval. ChatGPT's own approval settings are separate.
- No tool promises meal deletion, goal changes, recipe editing, or stored macro
  totals. The listing and onboarding describe those same capability boundaries.

## Findings and release evidence still needed

1. **Read bootstrap caveat:** `requireMcpOwner` calls `ensurePersonalHousehold`.
   On an uninitialized/legacy account a nominal read can create a personal
   household or backfill its legacy household IDs. Set up the reviewer through
   the normal app first. Before release, decide whether to move bootstrap out of
   read paths or document why initialization is consistent with read semantics;
   verify the exact read-only flow. Do not describe all handlers as pure queries.
2. **Verification route missing:** `convex/http.ts` registers MCP/OAuth only; it
   does not serve `/.well-known/openai-apps-challenge`. Add and test that handler
   once the actual MCP hostname and verification mechanism are selected. Do not
   expose arbitrary environment variables through a challenge handler.
3. **Live scan pending:** compare all discovered names, schemas, scope filtering,
   annotations, and justifications to this inventory after deploying the approved
   revision. Code review and local tests do not certify the published endpoint.
4. **Model-selection evidence pending:** run the eight reviewer cases on supported
   surfaces, plus retries, rejected writes, membership removal, and revocation.
   Also run the supplementary historical reuse/template scenarios in the reviewer
   guide. The five positive cases are representative workflows, not coverage of
   every available tool.
5. **No custom tool UI:** omit screenshots from the public package while the MCP
   scan reports no UI output template. Web app recordings can still be review
   evidence. Branding icons remain required release assets.

Sources: [annotation/submission errors](https://developers.openai.com/plugins/deploy/submission-errors),
[review snapshots](https://developers.openai.com/plugins/deploy/app-review),
[OAuth packaging](https://developers.openai.com/plugins/build/plugins#configure-mcp-authentication).
