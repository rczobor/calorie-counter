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
  const meal = page.getByRole('button', { name: /Seeded breakfast/ })
  await meal.scrollIntoViewIfNeeded()
  await expect(meal).toBeInViewport()
})

test('a day without meals keeps the meal action without placeholder copy', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.getByText('0 / 2100 kcal logged')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: /Alex’s meals/ }),
  ).toBeVisible()
  await expect(page.getByText(/No meals logged/)).toHaveCount(0)
  await expect(
    page.getByText('Open a meal to see portions and nutrition sources.'),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Seeded breakfast/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

for (const width of [320, 390, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width}px ${colorScheme}: discard dialog buttons contain their labels`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme })
      await page.addInitScript(() => {
        localStorage.setItem(
          'calorie-counter:cooking-drafts:e2e-user:e2e-household',
          '{}',
        )
      })
      await page.goto('/cooking')
      await page.getByRole('button', { name: 'Discard old workspace' }).click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible()
      const action = dialog.getByRole('button', { name: 'Discard drafts' })
      await expect(action).toBeVisible()
      expect(
        await action.evaluate(
          (button) => button.scrollWidth <= button.clientWidth,
        ),
      ).toBe(true)
      const dialogBox = await dialog.boundingBox()
      for (const button of [
        action,
        dialog.getByRole('button', { name: 'Cancel', exact: true }),
      ]) {
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        expect(dialogBox).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(dialogBox!.x)
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          dialogBox!.x + dialogBox!.width,
        )
      }
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toHaveCount(0)
    })
  }
}

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
        '/settings/archived-meals',
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
