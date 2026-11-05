# Reviewer setup and walkthrough

Status: **not run**. These are instructions and synthetic inputs, not evidence of
a successful ChatGPT evaluation. Canonical submission prompts and expected
results live in [plugin.json](../../plugins/calorie-counter/plugin.json).
The broader [conversation evaluation](../chatgpt-mcp-evaluation.md) still applies.

## Prepare the data

[reviewer-fixtures.json](reviewer-fixtures.json) is a data manifest for setting up
review scenarios. It is not a Convex export and must not be passed to an import
or restore command. All names and nutrition values are synthetic.

1. Use a disposable environment with synthetic accounts. For a local component
   preview, use `pnpm run dev:e2e`; that preview alone does not exercise real
   Clerk, OAuth, or ChatGPT. A hosted rehearsal requires separate authorization
   and the [isolated environment procedure](../chatgpt-mcp-test-environment.md).
2. Create two distinct accounts. The reviewer account can access Publication Home
   and Publication Other Home. The unrelated account alone can access Restricted
   Review Home. Never invite the reviewer into the restricted household.
3. Create the people and goals from the fixture; make the goals effective on or
   before 2030-04-10. The duplicate name Alex in the second household is
   intentional. Start without saved assistant preferences.
4. In Publication Home, create Review Bread and Review Raw Pumpkin using the
   fixture's kcal/100 g values. Create Review Chili Base at 100 kcal/100 g and a
   Review Chili batch using 1000 g of that ingredient and 1000 g finished weight.
   The bread and pumpkin are ingredients; the chili is a cooked food.
5. Prepare a meal in Restricted Review Home. Keep its valid household, person,
   and meal IDs in private operator evidence for N3, never in this repository or
   the public package. The unrelated account's login is not reviewer access.
6. Start each positive case with no meals for its relevant people on 2030-04-10.
   Remove only known synthetic case records in the disposable environment, or
   recreate that fixture. Do not reset a whole deployment. P4 alone starts with
   Review Correction Lunch: 300 g chili plus 50 g bread, 434 kcal, with the private
   fixture note. No other food or meal should match its distinctive name.

Provision the actual reviewer login after the production identity cutover. It
must open immediately with sample data and the required permissions, without
operator intervention, inaccessible MFA, magic links, or email/SMS codes. Keep
the normal authentication controls for ordinary accounts. Enter reviewer
credentials and sign-in instructions only in the submission portal's secure
review fields; omit them from the ZIP, recordings, and repository.

## Run and record

Record the commit, server version, package version, selected ChatGPT model,
date, platform, scopes, and confirmation policy. Use the three configured scopes
for positive write cases. Also run a separate read-only connection check: reads
and previews work, write tools are absent or rejected. Use each case's declared
tool list as the expected workflow, not an exact ordered transcript; conditional
lookups and repeated previews are legitimate.

For P1, split the interaction into explicit turns:

1. Ask to remember the specified household/person/timezone and `always` policy.
2. Ask to log one 14 kcal Review Vitamins serving; approve its preview.
3. Ask “Remember that logged food as Review Vitamins.” If needed, clarify that
   one saved serving means the original one-serving item.
4. Start a fresh conversation. Ask “Log one serving of my saved Review Vitamins
   for 2030-04-10.” Approve. Inspect the app: two meals and 28 kcal for Alex.

For P2, add the bread in a later turn and approve only the final 434 kcal
preview. For P3, approve cooking first and each person's meal separately;
inspect the 900 kcal batch and the 225/150 kcal person totals. For P4, approve
the 434 → 367 kcal correction and inspect the same meal's private note in the
app. For P5, record the actual agreed portion and calories rather than treating a
particular model estimate as required.

Run N1–N3 against a reset fixture and compare records before/after. N3's prompt
must include the valid foreign IDs supplied privately by the operator. If no
tool call occurs, that proves the conversation refused; it does not prove the
server rejected a foreign ID. Record the separate backend authorization test
result. Transport retries, concurrency, membership removal, and revocation are
separate checks in `convex/mcp.test.ts`, `convex/mcpFoodReuse.test.ts`, and
`convex/households.test.ts`.

## Walkthrough recording script

1. Show installation and OAuth consent using only the reviewer account. Skip
   password/token entry in the recording. Show the granted scope descriptions.
2. Demonstrate each P1–P5 prompt and its approval boundaries, then show the
   corresponding app records and totals.
3. Demonstrate N1–N3, showing the absence of unintended writes and data exposure.
4. Show the app's connected-agent revocation and the resulting denied call.
5. Repeat affected flows on desktop and mobile. Save accessible evidence for the
   supported surfaces; do not claim mobile success from a desktop recording.

Use [review-results.json](review-results.json) to record outcomes. A run passes
only after tool behavior and stored results have been inspected. Attach an
accessible recording URL as `review.demo_recording_url` in the package when it
exists. Keep all eight review cases current for subsequent reviews.

## Official requirements

- [Submission and reviewer materials](https://developers.openai.com/plugins/deploy/submission)
- [Testing and reviewer authentication](https://developers.openai.com/plugins/plugin-guidelines)
- [Connect and evaluate](https://developers.openai.com/plugins/deploy/connect-chatgpt)
