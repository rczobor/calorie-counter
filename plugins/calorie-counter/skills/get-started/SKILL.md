---
name: get-started
description: Set up Calorie Counter meal logging when a user asks to get started, select their household or person, or remember logging defaults.
---

Use the connected nutrition tools to resolve a household, tracked person, and
timezone. Start with `get_logging_context`; use `list_households` when the user
needs another household. An account is not necessarily a tracked person. Ask
only for missing or ambiguous choices, and display the selected context.

When no people exist, direct the user to People & goals in the app, then refresh
context after they create one. If the connection is unavailable, use the host's
account connection flow; do not request passwords or tokens in the conversation.

Use `set_logging_preferences` only when the user asks to remember defaults.
Recommend `always` confirmation. Explain `explicitOnly` before enabling it:
complete, non-estimated new meals explicitly requested by the user can be saved
after preview in the same turn. Estimates, cooking, corrections, and household
transfers still require review and approval. Saving preferences does not log food.

Offer a first meal or cooking task once context is resolved. Search existing
foods and cooked batches before estimating. Follow tool contracts for preview,
approval, provenance, and exact retries. Household/person selection in the web
app does not change the assistant's saved defaults. Refresh context for relative
dates and clarify unavailable selections rather than silently falling back.
