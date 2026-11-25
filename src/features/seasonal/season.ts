/** Where this device remembers that the seasonal theme was turned off. */
export const SEASONAL_THEME_KEY = 'calorie-counter:seasonal-theme'

/**
 * Which seasonal layers apply on a calendar day (month 1-12). From November
 * 20 the winter layer (falling and settled snow, the snowman, Today's night
 * sky, the winter dark palette) runs through February, and the Christmas
 * layer (tree and presents, string lights, the candy-cane bar and cranberry,
 * pine and plum) through Epiphany, January 6.
 *
 * Self-contained, using nothing outside itself: the root document inlines its
 * source into a script that runs before the first paint.
 */
export function seasonFor(month: number, day: number, off: boolean) {
  const date = month * 100 + day
  return {
    winter: !off && (date >= 1120 || date <= 229),
    christmas: !off && (date >= 1120 || date <= 106),
  }
}

/**
 * How much of the phone's snowman is built on a calendar day. Building starts
 * on January 7, the day the tree leaves the spot it stands in, and adds a
 * part every third day: the body, the head, the face and buttons, the arms,
 * then the hat and scarf on January 19. It stands whole until winter ends. 0
 * is no snowman, 5 a whole one.
 */
export function snowmanStage(month: number, day: number) {
  const date = month * 100 + day
  if (date < 107 || date > 229) return 0
  return month === 1 ? Math.min(5, Math.floor((day - 7) / 3) + 1) : 5
}

/**
 * Puts the `winter` and `christmas` classes on <html> for today's local date
 * and this device's preference. It runs as an inline script (see
 * `seasonScript`) so the season's colours are there on first paint rather
 * than flashing in after hydration; afterwards React keeps the classes in
 * sync. Self-contained for the same reason, so the key is repeated here.
 */
function applySeasonClasses(season: typeof seasonFor) {
  let off = false
  try {
    off =
      window.localStorage.getItem('calorie-counter:seasonal-theme') === 'off'
  } catch {
    // Without storage the season simply shows.
  }
  const now = new Date()
  const layers = season(now.getMonth() + 1, now.getDate(), off)
  const classes = document.documentElement.classList
  classes.toggle('winter', layers.winter)
  classes.toggle('christmas', layers.christmas)
}

/** The inline script for the root document's head. */
export const seasonScript = `(${applySeasonClasses.toString()})(${seasonFor.toString()})`
