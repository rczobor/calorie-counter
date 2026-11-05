# Simplified nutrition UI review

These screenshots use the real app components in `dev:e2e`, with synthetic
records and the mocked authenticated transport. They do not show live household
information or prove the deployed Clerk/Convex integration.

Meal-template management adds explicit portions, product replacement, removal,
renaming, conflict protection and confirmed deletion. Templates retain recorded
nutrition until a product is explicitly replaced. The associated Playwright flow
checks all four layouts and verifies that deletion cancellation preserves the
template.

- [Meal templates, desktop/light](templates-1440-light.png)
- [Meal templates, desktop/dark](templates-1440-dark.png)
- [Meal templates, mobile/light](templates-390-light.png)
- [Meal templates, mobile/dark](templates-390-dark.png)

The redesigned app uses Today, History, and Settings as primary destinations.
Today focuses on the person remembered on this device; household intake is
revealed on request. Archived meals live under Settings → Data maintenance.
Catalog and cooking remain reachable from Settings and through their existing URLs.

- [Today, desktop/light](today-desktop-light.png)
- [Meal inspection, desktop/light](meal-details-desktop-light.png)
- [History, desktop/light](history-desktop-light.png)
- [Settings, desktop/light](settings-desktop-light.png)
- [Today, mobile/dark](today-mobile-dark.png)
- [Household intake revealed, mobile/dark](household-mobile-dark.png)
- [Reusable-food inspection, mobile/dark](library-mobile-dark.png)
- [Cooked-food inspection, mobile/dark](cooking-mobile-dark.png)

Browser checks cover both 1440 px and 390 px widths in light/dark appearance,
keyboard theme selection, manual entry, meal correction, recovery across tabs
and households, history drill-down, cooked-food weight correction, and reusable
food archival/restoration, meal restoration from Settings, and deferred editor
loading. Date/person controls stay mounted while data loads, table skeletons
preserve search state, and pagination labels remain stable. Skeleton animation
respects reduced-motion preferences. Local screenshots are evidence for review rather
than pixel-comparison fixtures.
