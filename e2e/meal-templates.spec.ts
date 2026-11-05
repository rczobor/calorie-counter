import { expect, test } from '@playwright/test'

for (const width of [1440, 390]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width}px ${colorScheme}: manage meal templates with explicit product and deletion choices`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ colorScheme })
      await page.goto('/catalog')
      await page.getByRole('tab', { name: 'Meal templates' }).click()
      await page
        .locator('summary')
        .filter({ hasText: 'Regular breakfast' })
        .click()
      await page.getByRole('button', { name: 'Edit template' }).click()
      await expect(page.getByLabel('Quantity (g)')).toHaveValue('50')
      await expect(page.getByLabel('Quantity (cookies)')).toHaveValue('2')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`templates-${width}-${colorScheme}.png`),
        fullPage: true,
      })
      await page
        .getByLabel('Template name', { exact: true })
        .fill('Lighter breakfast')
      await page.getByLabel('Quantity (g)').fill('75')
      await page.getByLabel('Remove Cookies').check()
      await page
        .getByRole('button', { name: 'Save template', exact: true })
        .click()
      await expect(
        page.locator('summary').filter({ hasText: 'Lighter breakfast' }),
      ).toBeVisible()
      await expect(page.getByText('75 g · 350 kcal / 100 g')).toBeVisible()
      await expect(page.getByText('Cookies', { exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Delete template' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(
        page.locator('summary').filter({ hasText: 'Lighter breakfast' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Delete template' }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Delete', exact: true })
        .click()
      await expect(page.getByText('No meal templates found.')).toBeVisible()
    })
  }
}
