# Support — working draft

Unpublished. TODO: replace the temporary name and add a monitored support
contact, expected handling process, and final public URLs.

## Getting started

Install the published plugin, connect your own Calorie Counter account, and
approve the requested permissions. Ask the assistant to select your household,
tracked person, and timezone. Ask it to remember those defaults if desired.
Create a tracked person under People & goals in the app when none exists.
App selection and assistant logging defaults are independent.

## Common issues

- **Wrong person, date, or household:** specify the intended selection. Review
  Settings → ChatGPT for saved defaults. Use the person's local date/timezone.
- **Household unavailable:** ask to list accessible households or check
  membership with an admin. A valid record ID does not grant access.
- **Save may have succeeded:** inspect the app's day before asking for another
  save. Ask the assistant to retry the original operation with its original key
  and exact input; a newly invented key can create a second meal.
- **Food or batch missing:** check the household, name, cooking date, and archive
  status. Distinguish an ingredient's raw nutrition from a cooked batch's density.
- **Cannot change a goal or delete a meal through ChatGPT:** use the app's
  supported controls. The assistant should explain its capability limits.
- **Connection expired or denied:** reconnect through the host's normal OAuth
  flow. Check that the requested read/write permissions match the intended task.
- **Stop assistant access:** revoke the agent under Settings → ChatGPT. This
  preserves meals and cooking history. Uninstalling the plugin and revoking its
  connection are separate actions.

## Reporting a problem

Use TODO: verified support channel. Include the approximate time and timezone,
browser/device, action, error message, and whether the app shows a saved result.
Redact names, meal details, and record IDs unless needed for the investigation.
Never send passwords, access/refresh tokens, invitation links, or authentication
codes. Do not post private food histories in public issues.

For access, export, correction, or erasure requests, use TODO: verified privacy
contact. The final public page must explain the identity checks and process.
Current source does not provide a complete self-service data export or
coordinated account/data erasure flow. Browser draft exports and operator Convex
backups are not a complete user-data export service.
