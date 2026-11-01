# ChatGPT conversation evaluation

Use these synthetic cases to check tool selection and conversation behavior after
changing MCP tools or instructions. Backend tests prove domain invariants; they
do not prove that ChatGPT selects the right tools. Run these cases against the
[isolated test environment](chatgpt-mcp-test-environment.md), using marked test
people and foods. Never use a real person's food log for evaluation.

## Prepare and record evidence

1. Deploy the revision to the isolated environment, then refresh the custom MCP
   connection's metadata in ChatGPT and start a new conversation. Follow the
   [official refresh procedure](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata).
2. Record the revision, MCP server version, ChatGPT model, test date, granted
   scopes, and confirmation preference. Keep OAuth credentials out of evidence.
3. Expand tool details and capture the tool names, inputs, results, and relevant
   user-visible replies. Shared ChatGPT links can redact tool payloads, so a
   shared conversation alone may not prove which records were written.
4. Inspect the resulting records and daily totals in the isolated app. Record
   pass/fail for each criterion; leave unexecuted cases marked **not run**.

Use one synthetic account with two households and a person named Alex in each.
Give the households distinct names. Test both with an established logging
preference and without one. Keep the first 512 characters of server instructions
self-contained, as recommended by the
[official custom MCP guidance](https://developers.openai.com/api/docs/guides/custom-mcp-server#how-to-use).

## 1. Reuse cooked pumpkin in cookies

Prepare a saved pumpkin batch from 2,000 g raw pumpkin at 45 kcal/100 g, with
1,200 g finished cooked weight. Its batch energy is 900 kcal and its cooked
density is 75 kcal/100 g.

Prompt: “Use 300 g of the baked pumpkin I saved yesterday in a new cookie batch.
I will give you the other ingredients next.” Later supply the remaining measured
ingredients and finished cookie weight, review the preview, and approve saving.

Pass criteria:

- ChatGPT finds the saved cooked batch, clarifying if several batches match.
- The pumpkin contributes 225 kcal. It never substitutes the raw 45 kcal/100 g
  value or an unrelated generic pumpkin-purée estimate.
- The saved cookie composition preserves the selected batch's nutrition and
  source information according to the cooking input contract.
- Preparing or saving cooking does not log the entire batch as a meal.

## 2. Resolve preferences in a fresh conversation

Prompt: “Use Test Home, Alex, and Europe/Budapest for my food logging from now on.”
Then start a fresh conversation and say: “Log my 14 kcal vitamins for today.”

Pass criteria:

- Defaults are persisted through an app tool, rather than only promised in prose.
- The fresh conversation retrieves context and resolves the intended household,
  person, timezone, and local calendar date.
- ChatGPT asks when the first selection is ambiguous; it does not infer that the
  authenticated account is necessarily a tracked person.
- An explicit different household overrides the saved household without applying
  a person from the other household.
- If household membership is removed, the next call refuses access and requests
  a valid selection. It never silently writes to the personal household instead.
- Repeat near local midnight in a controlled backend fixture to prove that the
  date follows the selected timezone.

## 3. Update a pending meal before saving

Prompt: “Prepare 300 g of the saved test chili at 100 kcal/100 g for lunch. Do not
save yet.” After the preview, say: “Also add 50 g of bread at 268 kcal/100 g.”
Approve only the latest preview.

Pass criteria:

- The latest meal includes both foods and totals 434 kcal.
- No meal is written before approval; no earlier preview is accidentally saved.
- Saving creates one meal containing both items.
- Projected and saved daily totals come from tool results, with the correct
  context displayed. Replayed save results are not presented as a fresh read of
  the current day.

## 4. Subtract an uneaten bread slice

Prepare a saved meal containing 96 g bread at 268 kcal/100 g and another food.
Prompt: “I left about 25 g of that bread. Correct my lunch.” Approve the proposed
correction, then retry the same save in the transport-level test fixture.

Pass criteria:

- ChatGPT uses `get_day` and `get_meal` to select the original meal, clarifying
  when multiple lunches match.
- `preview_meal_correction` reduces bread to 71 g and the meal by 67 kcal.
- `correct_meal` edits that meal once; it does not create a negative meal or log
  the whole lunch again. Other items and private notes remain unchanged.
- A concurrent edit requires a fresh read, preview, and approval. An exact retry
  uses the original operation key and does not subtract another 25 g.

## 5. Preserve supplied values and distinguish estimates

Prompt: “The label says my vitamins are 14 kcal per serving. Log one serving.”
Later ask to save the food for reuse. In a fresh conversation, request it again.
Separately prompt: “Estimate a small bowl of homemade rice pudding.”

Pass criteria:

- The vitamins retain the supplied 14 kcal value and its stated source. Reuse
  does not relabel a known user-supplied value as a model estimate.
- Saving a reusable food happens only on an explicit request and does not
  rewrite historical meals or silently replace an existing catalog food.
- The rice pudding carries clear portion and nutrition assumptions. It is not
  represented as verified manufacturer nutrition.
- With the default confirmation policy, the assistant asks before saving.
  With an explicitly chosen direct-logging preference, a complete exact entry
  can be saved without another natural-language approval turn. Estimates and
  corrections still require review; ChatGPT's own write confirmation is separate.
- “Five toasties” triggers clarification of consequential assumptions, such as
  one or two bread slices each. A provided measured weight overrides photo-based
  guesses without retaining the old estimate.

## 6. Recover an interrupted multi-meal save

Prompt: “Prepare three separate meals for Alex on November 2: breakfast 200 kcal,
lunch 400 kcal, and dinner 600 kcal.” Approve the final set. In a transport-level
fixture, interrupt after a commit but before the client receives its response,
then retry the intended operation with its original key and input.

Pass criteria:

- Exactly three intended meals exist after recovery, totaling 1,200 kcal before
  any unrelated entries. Existing meals are preserved.
- If saves are separate operations, recovery identifies which succeeded and
  resumes the remaining saves. It does not describe partial completion as full
  success or replay successful writes with newly invented keys.
- If the server exposes an atomic multi-meal operation, a rejected input leaves
  no partial meals; an exact retry returns the original successful result.
- Cancelling before approval writes nothing. Cancelling after partial completion
  reports the completed writes accurately rather than claiming a rollback.

## Negative cases and result log

“How many calories might this contain?” must not save a meal. “Don't save that”
must not write. “Change Alex's goal” must not claim success through an unsupported
tool. Repeat a valid lookup with a foreign household ID in the backend fixture
and verify rejection before exposing its data.

For every run, record case, revision, observed tool sequence, resulting IDs and
totals, outcome, and any explanation for a deviation. Keep synthetic IDs in
private test evidence rather than copying account credentials or personal
conversation data into this document. Change one metadata field at a time when
diagnosing selection failures and rerun affected positive and negative prompts,
following the [official metadata evaluation guidance](https://developers.openai.com/plugins/guides/optimize-metadata).

These are acceptance cases, not a claim that manual ChatGPT evaluation has run.
