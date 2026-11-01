# Simplified nutrition UI review

These screenshots use the real app components in `dev:e2e`, with synthetic
records and the mocked authenticated transport. They do not show live household
information or prove the deployed Clerk/Convex integration.

The source baseline is main at `97f10b9`. The redesigned app uses Today, History,
and Settings as primary destinations. Catalog and cooking remain reachable from
Settings and through their existing URLs.

- [Today, desktop/light](today-desktop-light.png)
- [Meal inspection, desktop/light](meal-details-desktop-light.png)
- [History, desktop/light](history-desktop-light.png)
- [Settings, desktop/light](settings-desktop-light.png)
- [Today, mobile/dark](today-mobile-dark.png)
- [Reusable-food inspection, mobile/dark](library-mobile-dark.png)
- [Cooked-food inspection, mobile/dark](cooking-mobile-dark.png)

Browser checks cover both 1440 px and 390 px widths in light/dark appearance,
keyboard theme selection, manual entry, meal correction, recovery across tabs
and households, history drill-down, cooked-food weight correction, and reusable
food archival/restoration. Local screenshots are evidence for review rather
than pixel-comparison fixtures.
