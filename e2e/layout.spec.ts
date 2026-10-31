import { expect, test, type Locator } from '@playwright/test'

test('fitting desktop content does not scroll, but taller content remains reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByText('Seeded breakfast')).toBeVisible()

  const fittingHeight = await page.evaluate(() => ({
    document: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  }))
  expect(fittingHeight.document).toBe(fittingHeight.viewport)

  await page.setViewportSize({ width: 1440, height: 400 })
  const overflowingHeight = await page.evaluate(() => ({
    document: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  }))
  expect(overflowingHeight.document).toBeGreaterThan(overflowingHeight.viewport)
  await page
    .getByRole('button', { name: 'Create meal', exact: true })
    .scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('button', { name: 'Create meal', exact: true }),
  ).toBeInViewport()
})

async function expectVerticalGap(
  above: Locator,
  below: Locator,
  minimum: number,
) {
  await expect(above).toBeVisible()
  await expect(below).toBeVisible()
  const aboveBox = await above.boundingBox()
  const belowBox = await below.boundingBox()
  if (!aboveBox || !belowBox) {
    throw new Error('Expected visible elements to have layout boxes.')
  }
  expect(belowBox.y - (aboveBox.y + aboveBox.height)).toBeGreaterThanOrEqual(
    minimum,
  )
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px layout`, () => {
    test.use({ viewport })

    test('people fields and actions have vertical separation', async ({
      page,
    }) => {
      await page.goto('/people')

      await expectVerticalGap(
        page.getByLabel('Person name'),
        page.getByText('Daily calorie goal', { exact: true }),
        12,
      )
      await expectVerticalGap(
        page.getByLabel('Goal change reason'),
        page.getByRole('button', { name: 'Create Person', exact: true }),
        12,
      )
    })

    test('the meal submit button is separated from quick add', async ({
      page,
    }) => {
      await page.goto('/')

      await expectVerticalGap(
        page.getByRole('button', { name: 'Add', exact: true }),
        page.getByRole('button', { name: 'Create meal', exact: true }),
        16,
      )
    })

    test('cooking batch details are separated from the workspace', async ({
      page,
    }) => {
      await page.goto('/cooking')

      await expectVerticalGap(
        page.getByText(
          'Create your first batch to start cooking. Batches group foods by date and person.',
        ),
        page.getByRole('heading', { name: 'Current foods', exact: true }),
        12,
      )
    })
  })
}
