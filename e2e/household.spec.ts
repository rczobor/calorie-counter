import { expect, test } from '@playwright/test'

test('household settings disclose sharing and protect consequential membership changes', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/household')
  await expect(
    page.getByRole('heading', { name: 'Household', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(/Everyone in a household can view and manage/),
  ).toBeVisible()
  await expect(page.getByLabel('Household name')).toHaveValue('My household')
  await page.getByRole('button', { name: 'Leave household' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(
    page.getByText(/Shared nutrition data will remain/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('device selections and unsaved meals stay with their household after switching and refresh', async ({
  page,
}) => {
  await page.goto('/')
  const person = page.getByRole('combobox', {
    name: 'Select person',
    exact: true,
  })
  const household = page.getByRole('combobox', {
    name: 'Switch household',
    exact: true,
  })
  await expect(household).toHaveCount(0)
  await person.click()
  await page.getByRole('option', { name: 'Viki', exact: true }).click()
  await page.getByLabel('Meal name').fill('Home draft')
  await page.goto('/household')
  await household.click()
  await page
    .getByRole('option', { name: 'Shared household', exact: true })
    .click()
  await page.goto('/')
  await expect(page.getByLabel('Meal name')).toHaveValue('')
  await expect(person).toContainText('Alex')
  await page.getByLabel('Meal name').fill('Shared draft')
  await page.reload()
  await expect(person).toContainText('Alex')
  await expect(page.getByLabel('Meal name')).toHaveValue('Shared draft')
  await page.goto('/household')
  await household.click()
  await page.getByRole('option', { name: 'My household', exact: true }).click()
  await page.goto('/')
  await expect(page.getByLabel('Meal name')).toHaveValue('Home draft')
  await expect(person).toContainText('Viki')
  await page.reload()
  await expect(person).toContainText('Viki')
})
