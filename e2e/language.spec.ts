import { expect, test } from '@playwright/test'

test.describe('a Hungarian browser', () => {
  test.use({ locale: 'hu-HU' })

  test('starts in Hungarian before the account has chosen a language', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ma' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu')
    await expect(
      page.getByRole('navigation', { name: 'Fő navigáció' }).first(),
    ).toBeVisible()
  })
})

test('the language chosen in Settings applies at once and stays after a reload', async ({
  page,
}) => {
  await page.goto('/settings')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Settings' }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('combobox', { name: 'Language: English' }).click()
  await page.getByRole('option', { name: 'Magyar' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Beállítások' }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu')

  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Beállítások' }),
  ).toBeVisible()

  await page.getByRole('combobox', { name: 'Nyelv: Magyar' }).click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Settings' }),
  ).toBeVisible()
})
