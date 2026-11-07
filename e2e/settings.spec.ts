import { expect, test } from '@playwright/test'

test('desktop search keeps focus when typing closes cooked-food details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/cooking')
  await page.getByRole('button', { name: /Homemade chili/ }).click()
  const details = page.getByRole('region', {
    name: 'Homemade chili',
    exact: true,
  })
  await expect(details).toBeFocused()
  const search = page.getByRole('textbox', { name: 'Search cooked foods' })
  await search.focus()
  // Whitespace keeps the same results and leaves the previous food button mounted.
  await search.pressSequentially(' ')
  await expect(search).toBeFocused()
  await expect(details).toHaveCount(0)
  await search.pressSequentially(' chili')
  await expect(search).toHaveValue('  chili')
  await expect(search).toBeFocused()
})

for (const width of [390, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width}px ${colorScheme}: cooking details adapt and return focus to the list`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ colorScheme })
      await page.goto('/cooking')
      const food = page.getByRole('button', { name: /Homemade chili/ })
      await food.click()
      const details = page.getByRole('region', {
        name: 'Homemade chili',
        exact: true,
      })
      await expect(details).toBeVisible()
      await expect(details).toBeFocused()
      await expect(
        details.getByRole('heading', { name: 'Ingredients' }),
      ).toBeVisible()
      const search = page.getByRole('textbox', { name: 'Search cooked foods' })
      if (width < 1024) {
        await expect(search).toBeHidden()
        await expect(
          page.getByRole('heading', { name: 'Homemade chili', level: 1 }),
        ).toBeVisible()
      } else {
        await expect(search).toBeVisible()
        await expect(
          page.getByRole('heading', { name: 'Cooked batches', level: 1 }),
        ).toBeVisible()
      }
      await expect(
        page.getByText(/Record new cooking through ChatGPT/),
      ).toHaveCount(0)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: testInfo.outputPath('cooking-details.png'),
        fullPage: true,
      })
      await details.getByRole('button', { name: 'Cooked food actions' }).click()
      await expect(
        page.getByRole('menuitem', { name: 'Archive', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('menuitem', { name: 'Delete permanently' }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
      await page
        .getByRole('navigation', { name: 'breadcrumb' })
        .getByRole('button', { name: 'Cooked batches' })
        .click()
      await expect(details).toHaveCount(0)
      await expect(food).toBeFocused()
      await expect(search).toBeVisible()
      for (const [route, title] of [
        ['/settings', 'Settings'],
        ['/people', 'People & goals'],
        ['/household', 'Household'],
        ['/settings/integrations', 'AI assistants'],
        ['/settings/archived-meals', 'Archived meals'],
      ]) {
        await page.goto(route)
        await expect(
          page.getByRole('heading', { level: 1, name: title, exact: true }),
        ).toBeVisible()
        if (route === '/people')
          await expect(
            page.getByRole('button', { name: 'Edit Alex', exact: true }),
          ).toBeVisible()
        if (route === '/household')
          await expect(page.getByLabel('Household name')).toBeVisible()
        if (route === '/settings/integrations')
          await expect(
            page.getByText('Europe/Budapest', { exact: true }),
          ).toBeVisible()
        await page.screenshot({
          path: testInfo.outputPath(`${route.replaceAll('/', '-')}.png`),
          fullPage: true,
        })
      }
    })
  }
}
