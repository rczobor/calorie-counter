import { expect, test } from '@playwright/test'

test('records a weight from Today, then corrects and deletes it on the weight page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const row = page.getByRole('link', { name: /^Weight/ })
  await expect(row).toContainText('Not recorded')

  await page
    .getByRole('button', { name: /^Record Alex’s weight for Today/ })
    .click()
  const weight = page.getByLabel('Weight', { exact: true })
  await expect(weight).toBeFocused()
  await weight.fill('82,4')
  await page.getByRole('button', { name: 'Save weight' }).click()
  await expect(row).toContainText('82.4 kg')

  await row.click()
  await expect(page).toHaveURL(/\/weight$/)
  await expect(
    page.getByRole('heading', { name: 'Weight', level: 1 }),
  ).toBeVisible()
  await page.getByRole('button', { name: /^Today, \w+ \d+: 82.4 kg/ }).click()
  await page.getByLabel('Weight', { exact: true }).fill('81.9')
  await page.getByRole('button', { name: 'Save weight' }).click()
  await expect(
    page.getByRole('button', { name: /^Today, \w+ \d+: 81.9 kg/ }),
  ).toBeVisible()

  await page.getByRole('button', { name: /^Today, \w+ \d+: 81.9 kg/ }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByText('No weigh-ins yet')).toBeVisible()
})
