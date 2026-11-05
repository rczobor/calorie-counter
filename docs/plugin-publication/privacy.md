# Privacy policy — working draft

**Unpublished draft.** Calorie Counter is the temporary product name. Resolve
every TODO and the decisions in the [readiness checklist](README.md) before
publishing this text. Effective date: TODO. Operator/controller and contact:
TODO. This file describes source behavior; it does not verify vendor dashboard
settings or complete a jurisdiction-specific legal review.

## What the service processes

Calorie Counter connects your signed-in account to nutrition data in households
you belong to. We process account identifiers and membership information;
tracked people's names and calorie goals; foods, recipes and immutable recipe
versions; cooking dates, quantities, batch composition and weights; meals,
portions, dates, calorie totals, notes, and nutrition-source assumptions.

Assistant logging preferences include your selected household, tracked person,
timezone, and confirmation policy. Operation receipts retain bounded write
inputs and results so uncertain saves can be retried without duplicating them.
Connection records and authentication information support OAuth authorization,
permission checks, refresh, and revocation.

You can record people who do not have their own account. Provide information
about another person only with appropriate permission. Other members of a
household can view and manage its nutrition records. Household invitations grant
access to that shared dataset; they do not limit access to one person's meals.

## Why we use it

We use these records to authenticate accounts, enforce household access, calculate
nutrition and dated goals, preserve historical meaning, remember requested
defaults, fulfill approved operations, prevent duplicate writes, limit abusive
write traffic, and investigate errors and support requests.

TODO: specify the applicable legal bases and any required sensitive-data consent
for the intended audience and launch countries. Meal and goal information can
reveal personal health information. Do not describe collection as legally
authorized merely because the service is a nutrition tracker.

## Services involved and assistant sharing

- **Clerk** supplies account sign-in and identity. Credentials are handled by the
  authentication flow; do not put passwords or tokens into an assistant chat.
- **Convex** hosts application records and backend logic, including OAuth
  connection management and operation receipts.
- **Vercel** hosts the web application. The app includes Vercel Analytics and
  Speed Insights in its root layout; when enabled, these services can receive
  page-usage and performance measurements. TODO: verify their deployed settings,
  fields, retention, and any required consent/control before publishing.
- **OpenAI or another connected MCP client** receives tool requests and results
  when you use the integration. These can include household/person names,
  record IDs, foods, recipe/cooking composition, portions, dates, calorie goals
  and totals, saved preferences, and nutrition-source assumptions. The app's MCP
  tools omit account ownership identifiers and unrelated private notes. They do
  not expose Clerk credentials. Information you type or attach directly in a
  chat is also handled by that chat provider under its own terms and settings.

Calorie Counter does not call an LLM API to operate these tools, and the
application does not store the full ChatGPT conversation. Some write inputs and
their results are retained in operation receipts. Do not interpret the absence
of conversation storage as an absence of stored meal data or infrastructure logs.

TODO: identify other actual recipients, hosting regions, international transfer
arrangements, and vendor policy links from the selected production configuration.

## Storage and retention

Nutrition history, versions, archived records, and operation receipts currently
have no application-level scheduled deletion policy. Archived data remains
stored. Deleting a catalog record can be restricted when history references it.
Disconnecting an assistant or leaving a household does not delete meals.

The OAuth component expires credentials and cleans up expired authentication
requests/tokens and unused clients. Revocation invalidates the connection. Those
mechanisms do not erase domain data, write receipts, or copies already received
by an assistant provider.

Your browser also stores selection preferences and drafts in local/session
storage. Some selections persist across visits; tab-scoped drafts can survive a
refresh. Clearing browser storage removes those local copies, not server data.

TODO: choose and implement or verify retention periods for account records,
nutrition history, operation receipts, support correspondence, service logs,
telemetry, backups, and deleted-account data, including any lawful exceptions.
Replace this draft section with definite timelines before submission; “until
needed” is not a substitute for an agreed retention policy.

## Your controls

You can inspect and correct supported records in the app, manage household
membership, inspect or reset assistant logging defaults, and revoke connected
agents under Settings → ChatGPT. Revocation prevents future use of that
connection without removing nutrition history. Reference rules can require
archiving instead of deleting individual records.

TODO: publish the verified support contact, identity-verification procedure, and
process for access, export, correction, and erasure requests. A coordinated
Clerk-account/Convex-data deletion workflow and full self-service household
export have not been identified in the current source. Do not promise either
as a working button. Shared-household records require a deliberate policy for
the rights and historical records of other members.

## Audience and policy updates

TODO: choose the eligible audience, age requirements, treatment of information
about children, and launch jurisdictions. Add the finalized policy-update and
notification process and operator contact. Do not publish an age/consent promise
without matching onboarding and enforcement.

## Internal source notes — remove from published copy

- `convex/schema.ts`, `convex/validators.ts`: domain data, membership, preferences,
  provenance, receipts, and history; no domain retention job is configured.
- `convex/mcp.ts`, `convex/mcpValidators.ts`, `convex/mcpOperations.ts`,
  `convex/mcpMealCorrections.ts`, `convex/mcpFoodReuse.ts`: exposed data and writes.
- `convex/households.ts`: membership changes preserve nutrition records.
- `src/routes/__root.tsx`: Analytics and Speed Insights mounting.
- `src/features/integrations/*`: consent, preferences, and revocation controls.
- Pinned `@convex-dev/mcp` component: OAuth storage, expiry, revocation, and hourly
  bounded credential cleanup; verify again if the dependency changes.
- [OpenAI privacy requirements](https://developers.openai.com/plugins/plugin-guidelines#privacy)
  require a published policy with data categories, uses, recipients, retention
  timelines, and user controls.
