import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px theme selector`, () => {
    test.use({ viewport, colorScheme: 'dark' })

    test('keeps choices closed and persists an override and a return to System', async ({
      page,
    }) => {
      await page.goto('/')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Today' }),
      ).toBeVisible()

      const trigger = page.getByRole('combobox', { name: 'Theme: System' })
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('listbox')).toHaveCount(0)
      await expect(page.locator('html')).toHaveClass('dark')

      await trigger.click()
      await expect(page.getByRole('option', { selected: true })).toHaveText(
        'System',
      )
      await page.getByRole('option', { name: 'Light', exact: true }).click()
      await expect(page.getByRole('listbox')).toHaveCount(0)
      await expect(page.locator('html')).toHaveClass('light')

      await page.reload()
      const lightTrigger = page.getByRole('combobox', { name: 'Theme: Light' })
      await expect(lightTrigger).toBeVisible()
      await expect(page.locator('html')).toHaveClass('light')
      await lightTrigger.click()
      await expect(page.getByRole('option', { selected: true })).toHaveText(
        'Light',
      )
      await page.getByRole('option', { name: 'Dark', exact: true }).click()
      await expect(page.locator('html')).toHaveClass('dark')

      const darkTrigger = page.getByRole('combobox', { name: 'Theme: Dark' })
      await darkTrigger.focus()
      await darkTrigger.press('ArrowDown')
      await expect(page.getByRole('listbox')).toBeVisible()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await expect(trigger).toBeFocused()
      await expect(page.getByRole('listbox')).toHaveCount(0)

      await page.reload()
      await expect(trigger).toBeVisible()
      await expect(page.locator('html')).toHaveClass('dark')
      await page.emulateMedia({ colorScheme: 'light' })
      await expect(page.locator('html')).toHaveClass('light')
      await expect(trigger).toBeVisible()

      await trigger.press('Enter')
      await expect(page.getByRole('listbox')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
  })
}
