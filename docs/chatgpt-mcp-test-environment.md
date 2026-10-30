# Isolated ChatGPT test environment

This environment belongs only to MCP integration testing. Production and the
daily preview use different resources. Keep the root `.env.local` unchanged.

| Resource                   | Target                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| Vercel project             | `nethzyrs-projects/calorie-counter-mcp-test`                              |
| Vercel project ID          | `prj_fP2UB1tHktZgGRjWQerlqtVRVbWE`                                        |
| Frontend                   | <https://calorie-counter-mcp-test-n9jdlyyfg-nethzyrs-projects.vercel.app> |
| Convex project             | `robert-czobor/calorie-counter-mcp-test`                                  |
| Convex deployment          | `dev:dapper-ibis-334`                                                     |
| Convex client URL          | <https://dapper-ibis-334.eu-west-1.convex.cloud>                          |
| MCP endpoint               | <https://dapper-ibis-334.eu-west-1.convex.site/mcp>                       |
| Clerk development instance | `ins_3LPjSGOyTPnzl6iFammYPr3f7BA`                                         |
| Clerk issuer               | <https://open-mite-1623.clerk.accounts.dev>                               |

The frontend has Vercel Authentication protection in addition to Clerk test
authentication. The MCP endpoint is public HTTPS and requires OAuth for tools.
The unused initial frontend deployment was removed; use the preview URL above.

## Restore local configuration

`.env.mcp-test.local` is ignored by Git and selects only this Convex deployment:

```dotenv
CONVEX_DEPLOYMENT=dev:dapper-ibis-334
VITE_CONVEX_URL=https://dapper-ibis-334.eu-west-1.convex.cloud
VITE_CONVEX_SITE_URL=https://dapper-ibis-334.eu-west-1.convex.site
CLERK_JWT_ISSUER_DOMAIN=https://open-mite-1623.clerk.accounts.dev
MCP_CONSENT_URL=https://calorie-counter-mcp-test-n9jdlyyfg-nethzyrs-projects.vercel.app/connect
```

The existing local file also contains `VITE_CLERK_PUBLISHABLE_KEY` for that test
instance. Recover the publishable key and private operational credentials from
Vercel when needed; do not copy production Clerk keys:

```sh
mkdir -p .mcp-test
pnpm dlx vercel@65.5.0 env pull .mcp-test/clerk-development.env.local \
  --project prj_fP2UB1tHktZgGRjWQerlqtVRVbWE \
  --scope nethzyrs-projects --environment development --yes
chmod 600 .mcp-test/clerk-development.env.local
```

The file contains a Clerk test secret and a short-lived Vercel OIDC token. It is
only for operational tests; refresh it when the token expires. `.mcp-test/` and
all environment files are excluded from Vercel source uploads as well as Git.

## Deploy backend changes

First confirm `.env.mcp-test.local` selects `dev:dapper-ibis-334`. Then:

```sh
pnpm run deploy:mcp:test
```

This preserves the current frontend URL and existing ChatGPT connection.
The wrapper verifies the deployment target and restores `.env.local` after both
successful and failed commands; Convex otherwise rewrites that file even when
`--env-file` selects another deployment.
Refresh the connection's tool metadata in ChatGPT after changing tool schemas or
descriptions. Do not disconnect the user's connection just to refresh tools.

## Deploy frontend changes

Deploy from the repository with the explicit project and preview target. No
temporary source copy or root Vercel project link is necessary:

```sh
pnpm dlx vercel@65.5.0 deploy \
  --project prj_fP2UB1tHktZgGRjWQerlqtVRVbWE \
  --scope nethzyrs-projects --environment preview --yes
```

Inspect that deployment before using it. Its preview variables must contain the
test `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY`. If changing the frontend
URL used for consent, update `MCP_CONSENT_URL` on this Convex deployment, this
document, `.env.mcp-test.local`, and the target in `e2e/mcp-https.ts`. Keep the old
preview available until the new URL has been verified. Never promote this work
to the app's production project as part of test setup.

## Repeat the real HTTPS test

Install Playwright Chromium once, refresh the private development credentials
above, then run:

```sh
pnpm exec playwright install chromium
pnpm run test:mcp:https
```

`e2e/mcp-https.ts` verifies real Clerk sign-in, browser OAuth/PKCE, meal preview
and save, correction from 105 to 210 kcal, exact retry behavior, daily totals,
and estimate display in the app. It rejects any other Clerk instance or a live
Clerk key. It creates/reuses only its own marked synthetic account and archives
its test person after success. It cleans up that account's temporary grants and
session; it does not use or disconnect the user's ChatGPT connection. Historical
fixture meals remain under archived test people.

The fixture identity is recorded privately in `.mcp-test/smoke-user.json`. Keep
it to reuse the same account. No credential or fixture state in `/tmp` is
required by this test or the deployment commands.

## Manual ChatGPT evaluation

Reported successful by Robi on 2026-10-30:

- Person discovery and logging an estimated banana after approval.
- Reading saved meals back and checking the app.
- Cooking a batch and logging a portion.
- Clarifying missing information and declining a proposed save.
- Correcting an existing meal from ChatGPT after refreshing the tool metadata
  ([shared result](https://chatgpt.com/s/t_6ae4c3bba42881918988d255a58ed19b)).

Manual disconnect/reconnect is deferred at Robi's request. Automated revocation
coverage already exists; repeating that manual test is not a prerequisite for
testing corrections.

The automated real HTTPS correction test passed on 2026-10-30: one 105 kcal
banana became two bananas at 210 kcal within the same meal, replay left the total
unchanged, and the estimate remained visible. Obsolete synthetic people were
archived with their historical meals preserved. The guarded backend deployment
was also verified to preserve the ordinary `.env.local` byte-for-byte.

After refreshing tool metadata, try: “Actually, I ate two bananas, not one.
Correct that meal.” Check the preview names the original meal, changes its total
to 210 kcal, and leaves one meal in the app after saving. Try a fresh conversation
with two similar meals to check disambiguation. If the meal changes in the app
while a correction is being reviewed, saving must fail and require a new preview.
