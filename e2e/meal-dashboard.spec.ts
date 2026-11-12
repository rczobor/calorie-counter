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
  // The title is the day picker.
  const day = page.getByRole('heading', { level: 1 }).getByRole('button')
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
  await page.getByRole('link', { name: 'AI assistants', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'AI assistants', exact: true }),
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
  await page.getByRole('button', { name: 'Log meal', exact: true }).click()
  await page.getByLabel('Meal name').fill('Browser smoke snack')
  await page.getByRole('button', { name: 'Quick calories' }).click()
  await page.getByLabel('Quick add name').fill('Banana')
  await page.getByLabel('Quick add calories').fill('105')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page
    .getByRole('button', { name: 'Save meal (1 food)', exact: true })
    .click()
  await expect(page.getByText('Meal created.', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Browser smoke snack/ }),
  ).toBeVisible()
  await expect(page.getByText('355 / 2100 kcal logged')).toBeVisible()
  await expect(page.getByLabel('Meal name')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('on a phone, Log meal works from any tab and search adds a food by keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/history')
  // The shell is prerendered; wait for the client-rendered page before acting.
  await expect(
    page.getByRole('heading', { name: 'History', level: 1 }),
  ).toBeVisible()
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  })
  await navigation.getByRole('button', { name: 'Log meal' }).click()
  await expect(page).toHaveURL(/\/$/)
  const search = page.getByLabel('Search foods')
  await expect(search).toBeFocused()
  await search.fill('bea')
  await page.getByRole('button', { name: /^Beans/ }).click()
  await page.getByLabel('Ingredient grams').fill('150')
  await page.getByLabel('Ingredient grams').press('Enter')
  await expect(search).toBeFocused()
  await page.getByRole('button', { name: 'Save meal (1 food)' }).click()
  await expect(page.getByText('Meal created.', { exact: true })).toBeVisible()
  await expect(page.getByText('400 / 2100 kcal logged')).toBeVisible()
})

test('a meal correction preserves the record and updates intake', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Seeded breakfast/ }).click()
  await page.getByRole('button', { name: 'Edit meal', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Seeded oatmeal' }).click()
  await page.getByLabel('Quick add calories').fill('300')
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  await page.getByRole('button', { name: 'Save meal (1 food)' }).click()
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
    page.getByRole('heading', { name: 'Cooking', level: 1 }),
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
  await expect(
    page.getByRole('button', {
      name: 'Homemade chili 1200 g cooked · per 100 g 100 kcal',
    }),
  ).toBeVisible()
})

test('meal drafts recover on request after refresh and stay independent across tabs', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log meal', exact: true }).click()
  await page.getByLabel('Meal name').fill('First tab draft')
  await page.getByRole('button', { name: 'Quick calories' }).click()
  await page.getByLabel('Quick add name').fill('Banana')
  await page.getByLabel('Quick add calories').fill('105')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Quick calories' }).click()
  await page.getByLabel('Quick add name').fill('Unfinished snack')
  const otherTab = await context.newPage()
  await otherTab.goto('/')
  await otherTab.getByRole('button', { name: 'Log meal', exact: true }).click()
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
  await page.getByRole('button', { name: 'Save meal (1 food)' }).click()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Continue draft' }),
  ).toHaveCount(0)
  await otherTab.reload()
  await otherTab.getByRole('button', { name: 'Continue draft' }).click()
  await expect(otherTab.getByLabel('Meal name')).toHaveValue('Second tab draft')
  await otherTab.close()
})

test('a history bar opens its day using the same intake view', async ({
  page,
}) => {
  await page.goto('/history')
  await expect(
    page.getByRole('heading', { name: 'Daily calories' }),
  ).toBeVisible()
  // The chart is hidden from assistive technology (the Days list has its
  // links), so the latest day's bar is found by its drawing.
  await page
    .getByRole('region', { name: 'Daily calories' })
    .locator('.recharts-bar-rectangle')
    .last()
    .click()
  await expect(
    page.getByRole('heading', { name: 'Today', level: 1 }),
  ).toBeVisible()
  await expect(page.getByText('250 / 2100 kcal logged')).toBeVisible()
})

test('reusable foods can be inspected, archived, and restored without editing past meals', async ({
  page,
}) => {
  await page.goto('/catalog?section=foods')
  await page.getByRole('button', { name: /^Vitamins\b/ }).click()
  await expect(
    page.getByText(/One saved portion is the entire originally logged item/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Vitamins\b/ })).toHaveCount(0)
  // The list is empty now, so Show archived is a quiet button in its empty state.
  await page.getByRole('button', { name: 'Show archived' }).click()
  await page.getByRole('button', { name: /^Vitamins Archived\b/ }).click()
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(
    page.getByRole('button', { name: /^Vitamins Archived\b/ }),
  ).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByText('250 / 2100 kcal logged')).toBeVisible()
})

test('Today focuses on a remembered person and switches people from a list', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('region', { name: 'Alex’s intake' }),
  ).toBeVisible()
  // The list of people opens only on request.
  await expect(page.getByRole('option', { name: 'Viki' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'View history' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Archived meals' }),
  ).toHaveCount(0)
  await page.getByRole('combobox', { name: /^Switch person/ }).click()
  await page.getByRole('option', { name: 'Viki' }).click()
  await expect(
    page.getByRole('region', { name: 'Viki’s intake' }),
  ).toBeVisible()
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
    await page.getByRole('button', { name: 'Log meal', exact: true }).click()
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
    await expect(dialog.getByLabel('Search foods')).toBeVisible()
    await expect(
      dialog.getByRole('status', { name: 'Loading editor', exact: true }),
    ).toHaveCount(0)
  } finally {
    releaseEditor()
  }
})

test.describe('on a touch phone', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('the meal sheet settles after a short swipe and closes after a long one', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByText('Seeded breakfast')).toBeVisible()
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('button', { name: 'Log meal' })
      .click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByLabel('Search foods')).toBeFocused()
    const box = await sheet.boundingBox()
    if (!box) throw new Error('The sheet has no layout box.')
    const cdp = await page.context().newCDPSession(page)
    // Drag from the handle, the way a thumb would.
    const swipe = async (distance: number) => {
      const x = box.x + box.width / 2
      const y = box.y + 6
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      })
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + (distance * step) / 10 }],
        })
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
    }

    await swipe(30)
    await expect(sheet).toBeVisible()
    await expect.poll(async () => (await sheet.boundingBox())?.y).toBe(box.y)

    // Past half the sheet's height, so it closes however slowly a loaded
    // machine replays the drag; a shorter swipe closes only when fast.
    await swipe(box.height * 0.8)
    await expect(sheet).toHaveCount(0)
  })
})
