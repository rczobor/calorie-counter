import { expect, test } from '@playwright/test'

test('a return visit introduces installation, respects dismissal, and keeps help in Settings', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'iPhone Safari',
    })
  })
  await page.goto('/')
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
  await expect(page.getByText('Keep Calorie Counter handy')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem('calorie-counter:install:has-logged-meal'),
      ),
    )
    .toBe('true')
  await page.reload()
  const suggestion = page.getByRole('region', {
    name: 'Add Calorie Counter to your device',
  })
  await expect(suggestion).toBeVisible()
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(suggestion).toHaveCount(0)
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(suggestion).toBeVisible()
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(suggestion).toHaveCount(0)
  await page.getByRole('button', { name: 'Close editor' }).click()
  await expect(suggestion).toBeVisible()
  await suggestion.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await page.reload()
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
  await expect(suggestion).toHaveCount(0)
  await page.goto('/settings')
  const trigger = page.getByRole('button', { name: /Add to your device/ })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    page.getByText('Add to Home Screen', { exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('retains the native install offer across navigation and uses it once', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
  await page.evaluate(() => {
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {
          document.documentElement.dataset.installPromptCalls = '1'
        },
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      }),
    )
  })
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-install-prompt-calls',
  )
  const trigger = page.getByRole('button', { name: /Add to your device/ })
  await trigger.click()
  await expect(page.locator('html')).toHaveAttribute(
    'data-install-prompt-calls',
    '1',
  )
  await expect(trigger).toBeEnabled()
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText(/Open your browser’s menu/)).toBeVisible()
})

test('does not promote installation in standalone mode', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true })
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'iPhone Safari',
    })
    localStorage.setItem('calorie-counter:install:has-logged-meal', 'true')
  })
  await page.goto('/')
  await expect(page.getByText('Seeded breakfast')).toBeVisible()
  await expect(page.getByText('Keep Calorie Counter handy')).toHaveCount(0)
  await page.goto('/settings')
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Add to your device/ }),
  ).toHaveCount(0)
})

for (const width of [320, 390, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width}px ${colorScheme}: installation card and instructions fit`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme })
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => 'iPhone Safari',
        })
      })
      await page.goto('/')
      await expect(page.getByText('Seeded breakfast')).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('before.png'),
        fullPage: true,
      })
      await page.reload()
      const trigger = page.getByRole('button', { name: 'Show me how' })
      await expect(trigger).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: testInfo.outputPath('install-card.png'),
        fullPage: true,
      })
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(
        dialog.getByText('Add to Home Screen', { exact: true }),
      ).toBeVisible()
      const box = await dialog.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: testInfo.outputPath('install-steps.png'),
        fullPage: true,
      })
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
    })
  }
}
