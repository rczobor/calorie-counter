import { expect, test } from '@playwright/test'

test('fitting content stays compact while a short viewport keeps all controls reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    1000,
  )
  await page.setViewportSize({ width: 1440, height: 400 })
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeGreaterThan(400)
  await page
    .getByRole('button', { name: 'Archived meals' })
    .scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('button', { name: 'Archived meals' }),
  ).toBeInViewport()
})

for (const width of [1440, 390]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width}px ${colorScheme}: simplified pages and editors fit without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ colorScheme })
      for (const route of [
        '/',
        '/history',
        '/settings',
        '/catalog',
        '/cooking',
      ]) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const navigation = page.getByRole('navigation', {
          name: 'Primary navigation',
        })
        await expect(navigation.getByRole('link')).toHaveCount(3)
        await expect(
          navigation.getByRole('link', { name: 'Today', exact: true }),
        ).toBeVisible()
        await expect(
          navigation.getByRole('link', { name: 'History', exact: true }),
        ).toBeVisible()
        await expect(
          navigation.getByRole('link', { name: 'Settings', exact: true }),
        ).toBeVisible()
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width)
      }
      await page.goto('/people')
      await page.getByRole('button', { name: 'Add person' }).click()
      await expect(page.getByLabel('Person name')).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      await page.goto('/')
      await page.getByRole('button', { name: 'Add meal', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByLabel('Quick add name')).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
    })
  }
}
