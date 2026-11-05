# Production transition runbook

Planning artifact only. No live environment changes or identity migration have
been performed for this kit. Naming, operator identity, domains, production
accounts, and migration execution remain pending. Each external change requires
the user's authorization and an exact named target.

## 1. Fix the identities and endpoints

- Choose the final display name, package identifier, and publisher identity.
  The directory publisher must complete individual or business verification.
- Choose the frontend hostname, Clerk production domain, and durable MCP URL.
  Record the exact Vercel project, Convex project/deployment, Clerk instance,
  issuer, and consent URL in a private operator checklist. Do not copy secrets
  into this runbook or the package.
- Clerk's production setup requires a controlled domain and DNS records. Create
  the production instance, configure the `convex` JWT template/audience, and
  provide production social-provider credentials if social login is enabled.
  Do not assume development users, integrations, or provider credentials copy.
- Keep the current backend dataset in place unless a separately approved data
  migration requires moving it. A branding change does not require a new dataset.
- Configure the final frontend Clerk publishable key, Convex URL, backend Clerk
  issuer, and `MCP_CONSENT_URL` as one coordinated release. `/connect` remains the
  frontend consent URL; OAuth discovery is served at the MCP origin.

## 2. Preserve existing account access

Convex uses the issuer-qualified `identity.tokenIdentifier`, not an email, for
account identity. `CLERK_JWT_ISSUER_DOMAIN` currently accepts one Clerk issuer.
Changing the keys/issuer alone makes new production identities unrelated to old
household memberships.

Before choosing a cutover implementation, record an explicit verified mapping
of each old identity to its new production identity and intended households and
roles. Obtain the new identifier from authenticated identity evidence. Never
link accounts automatically by email or accept a client-provided identifier as
proof of ownership. Keep this mapping private; it contains account identifiers.

Prefer a narrow, idempotent internal migration for the small existing account
set, deployed only after a successful rehearsal. No such migration function is
included in this kit. Its required behavior is:

| Record                                    | Cutover action                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `householdMembers.tokenIdentifier`        | Add verified new memberships with the same roles; reject collisions or unintended privilege changes. Remove old memberships only when rollback and access validation permit it. Preserve a last admin.        |
| `households.personalOwnerTokenIdentifier` | Rebind the original personal-household pointer to the verified new identity, preventing an empty duplicate default household. Handle an already-created production household explicitly, never merge blindly. |
| `mcpPreferences.tokenIdentifier`          | Copy only after checking new membership/person scope. Resolve conflicting existing defaults explicitly. Do not overwrite silently.                                                                            |
| `householdInvitations.createdBy`          | Revoke outstanding invitations from old identities and create fresh ones as needed. Invite acceptance checks the inviter's current admin membership.                                                          |
| Historical `ownerTokenIdentifier` fields  | Preserve original attribution. Household membership is the authorization boundary; do not blanket-rewrite meals, recipes, or versions.                                                                        |
| MCP component grants/tokens               | Revoke old connections and reconnect using production auth. Do not transplant bearer tokens or component internals.                                                                                           |
| `mcpOperations`                           | Preserve receipts and attribution. A new connection has a different retry namespace; reconcile uncertain writes before cutover. Never retry an old uncertain save with a fresh key after reconnecting.        |
| Browser selections/drafts                 | Account namespaces change. Export/recover pending drafts using existing controls before switching; verify server meals separately.                                                                            |

Rehearse with synthetic old/new identities in an isolated `convex-test` harness
when the migration is implemented. Test repeated execution, duplicate/new
household collisions, explicit role conflicts, preferences in a foreign
household, last-admin preservation, removed memberships, and rollback. Record
that meal IDs, items, recipe versions, cooked composition, dates, and daily
totals remain unchanged. A runbook is not evidence those checks passed.

For any new validator or migration endpoint, use expand → deploy compatibility
→ run the already-deployed migration → verify → contract. If both issuers are
needed during transition, explicitly implement and rehearse a temporary
two-issuer configuration; the current single-issuer code does not provide it.

## 3. Rehearsal and cutover

1. Rehearse the exact planned revision against synthetic accounts first. Use
   the existing isolated-environment runbook only for its named test targets.
2. Confirm backup and rollback access. A final production backup is an external
   operation requiring authorization. Keep it encrypted/private and preserve
   the original export unchanged. Do not use real exports in public fixtures.
3. Arrange a bounded write pause for all app and MCP writers if consistency
   requires it; do not assume disabling frontend buttons pauses MCP clients.
   Reconcile pending writes and record counts/totals before switching.
4. Deploy the prepared compatibility/migration revision to the explicitly
   approved backend, configure the coordinated auth endpoints, and apply the
   verified mapping. Newly added functions are callable only after deployment.
5. Sign in as each migrated account. Check household list, role/admin actions,
   default household/person, old meals, dated goals, and totals. Sign in as a
   completely fresh account to check empty-state onboarding. Confirm a removed
   or unrelated account has no access.
6. Reconnect ChatGPT using production OAuth. Check approve/deny, scope filtering,
   refresh/reconnect, revoke, read-only mode, and a deliberately approved
   synthetic write. Verify household/person/date context in the tool results.
7. Resume writes only after successful reconciliation. Keep the tested rollback
   revision/configuration and mapping evidence for the agreed retention period.

## 4. MCP verification and directory submission

- Implement a GET handler for the exact
  `/.well-known/openai-apps-challenge` URL on the portal-selected MCP host or
  eligible parent. Return only the supplied public verification token as plain
  text. The current `convex/http.ts` does not implement this route.
- If choosing a custom MCP hostname/proxy, verify advertised OAuth resource,
  issuer, discovery URLs, audience checks, redirects, and token exchange against
  that exact origin. Do not assume a frontend CNAME also moves Convex HTTP.
- Finalize the package's actual URL and OAuth registration configuration. Current
  component discovery supports DCR and PKCE with token endpoint auth `none`.
- Publish final website/support/privacy/terms pages and supply square icons.
  This integration has no tool UI; omit UI screenshots unless one is introduced.
- Re-run the reviewer cases with the dedicated production demo account and
  synthetic data, record the exact revision and supported surfaces, and add the
  accessible recording URL. Complete policy/retention decisions first.
- Run OpenAI's upload, domain verification, authenticated scan, annotation
  justifications, review, and eventual publication. Keep credentials in secure
  portal fields. Local validation is not the portal's schema/security scan.

## Rollback

Before writes resume, revert to the tested prior frontend/backend/configuration
and reverse only the logged identity/membership changes. Reconnect old accounts
as needed; revoked tokens cannot be restored by changing keys. Verify original
household access and historical totals before reopening writes.

After new production writes exist, a full snapshot restore would discard them.
Pause writes, preserve a new private backup, and reconcile additions/corrections
before any destructive restore. Follow the existing README maintenance runbook
for an explicitly approved restore. Do not roll back by deleting households or
reassigning all records based on an email address.

## References

- [Repository maintenance/restore procedure](../../README.md#production-schema-reset-and-restore)
- [Clerk production setup](https://clerk.com/docs/guides/development/deployment/production)
- [Clerk environment separation](https://clerk.com/docs/guides/development/managing-environments)
- [OpenAI verification and submission](https://developers.openai.com/plugins/deploy/submission)
- [Publisher and production endpoint requirements](https://developers.openai.com/plugins/deploy/app-review)
