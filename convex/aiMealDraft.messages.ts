// Saved with each suggested food and shown beside it, in the language the
// person used when asking. The estimate's assumptions come from Claude in
// that language too.
const en = {
  estimateSource: 'Claude estimate',
  labelSource: 'Nutrition label photo, read by Claude',
  noAssumptions: 'No assumptions stated.',
}

export const aiMealDraftMessages = {
  en,
  hu: {
    estimateSource: 'Claude becslése',
    labelSource: 'Tápértékcímke fotója, Claude olvasta le',
    noAssumptions: 'Nincs megadott feltételezés.',
  } satisfies typeof en,
}
