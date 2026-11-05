# Plugin publication kit

Local draft; not submitted or ready for publication. Calorie Counter is a
temporary name. This kit performs no deployment, account provisioning, DNS
change, migration, or directory submission.

## Contents

- [Portable package](../../plugins/calorie-counter/plugin.json) and
  [OAuth server configuration](../../plugins/calorie-counter/mcp.json).
- [Onboarding skill](../../plugins/calorie-counter/skills/get-started/SKILL.md)
  for choosing account context and requested logging defaults.
- [Reviewer guide](reviewer-guide.md), [synthetic inputs](reviewer-fixtures.json),
  and [result tracker](review-results.json). The package holds the canonical five
  positive/three negative prompts; all live results are initially **not run**.
- [Tool audit and annotation justifications](tool-audit.md).
- Working drafts of [privacy](privacy.md), [terms](terms.md), and
  [support](support.md), with unresolved decisions explicitly marked.
- [Production auth, identity preservation, verification, and rollback runbook](production-transition.md).

## Local checks and packaging

From the repository root:

```bash
pnpm run setup:worktree
pnpm run plugin:check
```

The focused suite checks listing text limits, tool names/scopes against the
actual TypeScript declarations without executing the backend, eight review-case
references, safe URL shapes, onboarding presence, and fixture nutrition totals.
It runs in normal `pnpm run test`/coverage checks too. It does not run an official
JSON Schema validator, authenticate, contact OpenAI/Clerk/Convex, seed records,
or prove model behavior, URL reachability, policy compliance, or publication
readiness. A passing local suite is not a passing portal scan.

To build a reviewable draft ZIP with a system `zip` executable:

```bash
cd plugins/calorie-counter
zip -r /tmp/calorie-counter-plugin-draft.zip plugin.json mcp.json skills
```

Only those explicitly listed package files belong in the archive. Keep policies,
operator instructions, result logs, private evidence, credentials, `.env` files,
and backups outside it. Final policies are hosted public pages referenced by the
manifest, not bundled private review instructions. Add final artwork under
`assets/`, reference it in the manifest, and include that directory in the ZIP
when it exists. Do not upload the current draft: its `.invalid` URLs deliberately
do not connect to any service. No marketplace or plugin is auto-installed by
adding this folder to the repository.

Package version 0.1.0 is separate from MCP server version 1.2.0. Before uploading,
choose a stable package identifier; preserve any identity assigned by the portal.
The MCP server key `nutrition` is a package-local connection name, not branding.

## Readiness checklist

Local artifacts below are prepared, not evidence of external completion.

- [x] Draft portable manifest with listing copy and three starter prompts.
- [x] OAuth DCR declaration using discovery and the existing scoped tools.
- [x] Onboarding instructions using current account/household rules.
- [x] Five positive and three negative scenarios with concrete expected results.
- [x] Synthetic fixture manifest, walkthrough script, and blank evidence tracker.
- [x] Local tool audit with all annotation justifications and known caveats.
- [x] Policy/support drafts reflecting actual data flow and current gaps.
- [x] Production identity transition and rollback plan.
- [ ] Final name, stable package slug, verified publisher, square icons, and final
      release notes. Update source branding deliberately when the name is chosen.
- [ ] Final launch countries/age policy, operator contact, sensitive-data handling,
      and published privacy/terms/support pages. Omitted country targeting does
      not represent a decision to launch globally; set it explicitly at release.
- [ ] Definite retention periods, telemetry settings/controls, backup handling,
      and a functioning support process for export and erasure requests.
- [ ] Final frontend, Clerk, and MCP hostnames; production Clerk configuration.
- [ ] Implement/rehearse the narrow identity migration or another verified access
      preservation strategy. The runbook is not an executable migration.
- [ ] Resolve read-path bootstrap semantics described in the tool audit.
- [ ] Serve and verify OpenAI's exact MCP-host challenge; validate discovery and
      auth against the final origin, including fresh-account onboarding.
- [ ] Provision a dedicated synthetic reviewer account and enter credentials
      privately in the portal. Never relax authentication globally for reviewers.
- [ ] Run P1–P5/N1–N3 on supported desktop/mobile surfaces; record evidence and
      the accessible demo URL. Re-run after material behavior/auth changes.
- [ ] Run final repository gates and the actual portal schema/security/tool scan;
      resolve findings, submit for review, and publish only when authorized.

## Source of requirements

Checked against official documentation on 2026-11-05. Recheck it before upload:

- [Package layout and OAuth](https://developers.openai.com/plugins/build/plugins)
- [Submission, review materials, and domain verification](https://developers.openai.com/plugins/deploy/submission)
- [Listing limits and validation findings](https://developers.openai.com/plugins/deploy/submission-errors)
- [Privacy, tool behavior, and testing expectations](https://developers.openai.com/plugins/plugin-guidelines)

OpenAI may change submission requirements. Hosted metadata is scanned separately
from ZIP metadata; keep the backend compatible with the currently approved tool
contract while updates are reviewed.
