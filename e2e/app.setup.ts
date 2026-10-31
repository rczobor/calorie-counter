import { expect, test } from '@playwright/test'

// HTTP readiness precedes hydration and the first cold Vite compilation.
test('the synthetic app is ready before browser workflows', async ({
  page,
}) => {
  await page.goto('/', { timeout: 60_000 })
  await expect(page.getByText('Seeded breakfast')).toBeVisible({
    timeout: 30_000,
  })
})
