import { expect, test } from '@playwright/test'

test('integration settings and expired consent routes load in authenticated mock mode', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/settings/integrations')
  await expect(
    page.getByRole('heading', { name: 'Integrations', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'The ChatGPT integration has not been enabled for this deployment.',
    ),
  ).toBeVisible()
  await page.goto('/connect?request=expired')
  await expect(
    page.getByText(/This request has expired or was already handled/),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Allow access' })).toHaveCount(
    0,
  )
  expect(errors).toEqual([])
})

test('an authenticated user can create a quick-add meal', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.goto('/')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Meals' }),
  ).toBeVisible()
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
  await expect(page.getByText('250 of 2100 kcal logged')).toBeVisible()

  await page.getByLabel('Meal name').fill('Browser smoke snack')
  await page.getByLabel('Quick add name').fill('Banana')
  await page.getByLabel('Quick add calories').fill('105')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await page
    .getByRole('button', { name: 'Create meal (1 item)', exact: true })
    .click()

  await expect(page.getByText('Meal created.', { exact: true })).toBeVisible()
  await expect(page.getByText('Browser smoke snack')).toBeVisible()
  await expect(page.getByText('105 kcal', { exact: true })).toBeVisible()
  await expect(page.getByText('355 of 2100 kcal logged')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('the cooking route loads in authenticated mock mode', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.goto('/cooking')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Cooking' }),
  ).toBeVisible()
  await expect(page.getByText('No batches found.')).toBeVisible()
  expect(pageErrors).toEqual([])
})
