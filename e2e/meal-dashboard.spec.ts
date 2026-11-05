import { expect, test } from '@playwright/test'

test('the calendar loads on demand and remains keyboard accessible', async ({
  page,
}) => {
  const calendarRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/src/components/ui/calendar.tsx'))
      calendarRequests.push(request.url())
  })
  await page.route('**/src/components/ui/calendar.tsx', async (route) => {
    await expect(page.getByText('Loading calendar…')).toBeVisible()
    await route.continue()
  })
  await page.goto('/')
  const day = page.getByRole('button', { name: 'Day', exact: true })
  await expect(day).toBeVisible()
  expect(calendarRequests).toEqual([])
  const previous = await day.innerText()
  await day.focus()
  await page.keyboard.press('Enter')
  const calendar = page.getByRole('grid')
  await expect(calendar).toBeVisible()
  expect(calendarRequests).toHaveLength(1)
  await expect(
    calendar.locator('button[data-selected-single="true"]'),
  ).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(day).not.toHaveText(previous)
  await page.keyboard.press('Escape')
  await expect(calendar).toBeHidden()
  await expect(day).toBeFocused()
})

test('settings, integration defaults, and expired consent remain reachable', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/settings')
  await page.getByRole('link', { name: 'ChatGPT', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'ChatGPT', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Logging defaults' }),
  ).toBeVisible()
  await expect(page.getByText('Europe/Budapest', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Ask before saving', { exact: true }),
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

test('intake opens read-only and a manual meal updates live daily totals', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Today', level: 1 }),
  ).toBeVisible()
  await expect(page.getByText('250 / 2100 kcal logged')).toBeVisible()
  await expect(page.getByLabel('Meal name')).toHaveCount(0)
  await page.getByRole('button', { name: /Seeded breakfast/ }).click()
  await expect(page.getByText('Seeded oatmeal')).toBeVisible()
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  await page.getByLabel('Meal name').fill('Browser smoke snack')
  await page.getByLabel('Quick add name').fill('Banana')
  await page.getByLabel('Quick add calories').fill('105')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page
    .getByRole('button', { name: 'Create meal (1 item)', exact: true })
    .click()
  await expect(page.getByText('Meal created.', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Browser smoke snack/ }),
  ).toBeVisible()
  await expect(page.getByText('355 / 2100 kcal logged')).toBeVisible()
  await expect(page.getByLabel('Meal name')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a meal correction preserves the record and updates intake', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Seeded breakfast/ }).click()
  await page.getByRole('button', { name: 'Edit meal', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Quick add calories').fill('300')
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  await page.getByRole('button', { name: 'Save meal changes' }).click()
  await expect(page.getByText('300 / 2100 kcal logged')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Seeded breakfast/ }),
  ).toHaveCount(1)
})

test('cooked batches open for inspection and finished-weight correction', async ({
  page,
}) => {
  await page.goto('/cooking')
  await expect(
    page.getByRole('heading', { name: 'Cooked batches', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start cooking' })).toHaveCount(
    0,
  )
  await page.getByText('Homemade chili', { exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Ingredients', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit cooked food' }).click()
  await page.getByLabel('Finished weight (g)').fill('1200')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText(/1200 g/)).toBeVisible()
  await expect(page.getByText(/100 kcal \/ 100 g/)).toBeVisible()
})

test('meal drafts recover on request after refresh and stay independent across tabs', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  await page.getByLabel('Meal name').fill('First tab draft')
  await page.getByLabel('Quick add name').fill('Banana')
  await page.getByLabel('Quick add calories').fill('105')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByText('Add or replace food', { exact: true }).click()
  await page.getByLabel('Quick add name').fill('Unfinished snack')
  const otherTab = await context.newPage()
  await otherTab.goto('/')
  await otherTab.getByRole('button', { name: 'Add meal', exact: true }).click()
  await expect(otherTab.getByLabel('Meal name')).toHaveValue('')
  await otherTab.getByLabel('Meal name').fill('Second tab draft')
  await page.reload()
  await expect(page.getByLabel('Meal name')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue draft' }).click()
  await expect(page.getByLabel('Meal name')).toHaveValue('First tab draft')
  await expect(page.getByLabel('Quick add name')).toHaveValue(
    'Unfinished snack',
  )
  await otherTab.reload()
  await otherTab.getByRole('button', { name: 'Continue draft' }).click()
  await expect(otherTab.getByLabel('Meal name')).toHaveValue('Second tab draft')
  await page.getByRole('button', { name: 'Create meal (1 item)' }).click()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Continue draft' }),
  ).toHaveCount(0)
  await otherTab.reload()
  await otherTab.getByRole('button', { name: 'Continue draft' }).click()
  await expect(otherTab.getByLabel('Meal name')).toHaveValue('Second tab draft')
  await otherTab.close()
})

test('history opens its selected day using the same intake view', async ({
  page,
}) => {
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: 'Trend' })).toBeVisible()
  await expect(
    page.getByText('Average on days with meals logged'),
  ).toBeVisible()
  await page.getByRole('link', { name: 'View day →' }).click()
  await expect(
    page.getByRole('heading', { name: 'Today', level: 1 }),
  ).toBeVisible()
  await expect(page.getByText('250 / 2100 kcal logged')).toBeVisible()
})

test('reusable foods can be inspected, archived, and restored without editing past meals', async ({
  page,
}) => {
  await page.goto('/catalog')
  await page.getByText('Vitamins', { exact: false }).first().click()
  await page.getByText('Portion & nutrition', { exact: true }).click()
  await expect(
    page.getByText(/One saved portion is the entire originally logged item/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByText('14 kcal / saved portion')).toHaveCount(0)
  await page.getByLabel('Show archived', { exact: true }).check()
  await page.getByText('Vitamins · Archived', { exact: false }).click()
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(page.getByText('Vitamins · Archived')).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByText('250 / 2100 kcal logged')).toBeVisible()
})

test('Today focuses on a remembered person and reveals household intake on request', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('region', { name: 'Alex’s intake' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Viki/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'View history' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Archived meals' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Household intake' }).click()
  await page.getByRole('button', { name: /^Viki/ }).click()
  await expect(
    page.getByRole('region', { name: 'Viki’s intake' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Household intake' }),
  ).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Viki’s intake' }),
  ).toBeVisible()
})

test('archived meals are recoverable from Settings without cluttering Today', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Seeded breakfast/ }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(
    page.getByRole('button', { name: /Seeded breakfast/ }),
  ).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await page.getByRole('link', { name: /Archived meals/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Archived meals', level: 1 }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Seeded breakfast/ }).click()
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Today', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: /Seeded breakfast/ }),
  ).toBeVisible()
})

test('opening a deferred editor shows a skeleton without replacing the intake page', async ({
  page,
}) => {
  let releaseEditor = () => {}
  const editorReady = new Promise<void>((resolve) => {
    releaseEditor = resolve
  })
  await page.route(
    /\/src\/features\/meals\/meal-editor\.tsx/,
    async (route) => {
      await editorReady
      await route.continue()
    },
  )
  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add meal', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('status', { name: 'Loading editor', exact: true }),
    ).toBeVisible()
    await expect(dialog.getByText('Loading editor…')).toHaveCount(0)
    await expect(
      page.getByRole('heading', {
        name: 'Today',
        level: 1,
        includeHidden: true,
      }),
    ).toBeVisible()
    releaseEditor()
    await expect(dialog.getByLabel('Quick add name')).toBeVisible()
    await expect(
      dialog.getByRole('status', { name: 'Loading editor', exact: true }),
    ).toHaveCount(0)
  } finally {
    releaseEditor()
  }
})
