import { expect, test } from '@playwright/test'

test('finds a daily goal from the weight page and saves the plan with it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/weight')
  await page.getByRole('button', { name: 'Record weight' }).click()
  await page.getByLabel('Weight', { exact: true }).fill('82.4')
  await page.getByRole('button', { name: 'Save weight' }).click()

  // A first weigh-in brings the check-in, still learning, with a way in.
  const card = page.getByRole('region', { name: 'Maintenance' })
  await expect(card.getByText('Learning')).toBeVisible()
  await card.getByRole('button', { name: 'Find a daily goal' }).click()

  const sheet = page.getByRole('dialog', { name: 'Find a daily goal' })
  // Choices are toggle buttons, as everywhere in the app.
  const choose = (name: string | RegExp) =>
    sheet.getByRole('button', { name, exact: typeof name === 'string' }).click()
  await expect(sheet.getByLabel('Weight', { exact: true })).toHaveValue('82.4')
  await expect(
    sheet.getByText('Add sex, year of birth and 3 more'),
  ).toBeVisible()
  await choose('Female')
  await sheet.getByLabel('Year of birth').fill('1988')
  await sheet.getByLabel('Height').fill('170')
  await choose(/^Lightly active/)
  await choose('Lose')
  await expect(sheet.getByRole('button', { name: /^Steady/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(sheet.getByText(/^Current goal 2100 \(−\d+\)$/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Use goal' }).click()

  await expect(sheet).toBeHidden()
  await expect(card.getByText('Losing 0.5% a week')).toBeVisible()
  await expect(card.getByText(/^\d+ kcal a day$/).last()).not.toHaveText(
    '2100 kcal a day',
  )

  // In-app navigation keeps the synthetic data; a reload would reset it.
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await page.getByRole('link', { name: /People & goals/ }).click()
  await expect(page.getByText('Losing 0.5% a week')).toBeVisible()
})
