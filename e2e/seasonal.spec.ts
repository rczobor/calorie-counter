import { expect, test } from '@playwright/test'

// Christmas on a phone in light mode, where the night sky, lights and tree
// show on Today.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-10T12:00:00'))
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
})

test('a large font keeps the meals heading clear of the tree and presents', async ({
  page,
}) => {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '28px'
  })
  const gap = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2')).find((h2) =>
      h2.textContent?.includes('meals'),
    )
    const tree = Array.from(document.querySelectorAll('.christmas-tree')).find(
      (svg) => svg.getBoundingClientRect().width > 0,
    )
    if (!heading || !tree) throw new Error('heading or tree missing')
    const text = document.createRange()
    text.selectNodeContents(heading)
    // The presents stand outside the tree's box, so take its parts' edges.
    const decoration = Math.min(
      ...Array.from(
        tree.querySelectorAll('rect, path, ellipse'),
        (part) => part.getBoundingClientRect().left,
      ),
    )
    const words = Math.max(
      ...Array.from(text.getClientRects(), (line) => line.right),
    )
    return decoration - words
  })
  expect(gap).toBeGreaterThan(0)
})

test('the printed page has a readable title and no scenery', async ({
  page,
}) => {
  await page.emulateMedia({ media: 'print' })
  const title = page.locator('h1.on-winter-sky')
  const color = await title.evaluate((h1) => getComputedStyle(h1).color)
  // Not the white it wears on the sky.
  expect(color).not.toMatch(/oklch\(0\.98/)
  for (const scenery of ['.winter-sky', '.string-lights', '.christmas-tree'])
    for (const element of await page.locator(scenery).all())
      await expect(element).toBeHidden()
})

test('focus rings stay light on the night sky', async ({ page }) => {
  for (const control of [
    page.locator('h1.on-winter-sky button'),
    page.getByRole('button', { name: 'Previous day' }),
  ]) {
    await control.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(control).toBeFocused()
    // The ring is a box shadow that grows in; once it has its full 3px,
    // read its colour back as sRGB.
    const lightness = () =>
      control.evaluate((button) => {
        const ring = /(\S+\([^)]*\)) 0px 0px 0px 3px/.exec(
          getComputedStyle(button).boxShadow,
        )?.[1]
        const canvas = document.createElement('canvas').getContext('2d')
        if (!ring || !canvas) return 0
        canvas.fillStyle = ring
        canvas.fillRect(0, 0, 1, 1)
        const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data
        return (r + g + b) / 3
      })
    // White at the ring's 40%, not the deep cranberry, which vanishes on navy.
    await expect.poll(lightness).toBeGreaterThan(200)
  }
})
