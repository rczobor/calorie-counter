// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
} from '../src/tests/convex-test-utils'

describe('account language', () => {
  it('follows the browser until the account picks a language, then keeps it per account', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const other = asTestUserWithToken(t, 'https://example.test|other-user')

    expect(await user.query(api.userPreferences.getLocale, {})).toBeNull()

    await user.mutation(api.userPreferences.setLocale, { locale: 'hu' })
    await user.mutation(api.userPreferences.setLocale, { locale: 'hu' })
    expect(await user.query(api.userPreferences.getLocale, {})).toBe('hu')
    expect(await other.query(api.userPreferences.getLocale, {})).toBeNull()

    await user.mutation(api.userPreferences.setLocale, { locale: 'en' })
    expect(await user.query(api.userPreferences.getLocale, {})).toBe('en')
    expect(
      await t.run((ctx) => ctx.db.query('userPreferences').collect()),
    ).toHaveLength(1)
  })

  it('requires a signed-in account', async () => {
    const t = createConvexTest()
    await expect(t.query(api.userPreferences.getLocale, {})).rejects.toThrow(
      'Authentication required',
    )
    await expect(
      t.mutation(api.userPreferences.setLocale, { locale: 'hu' }),
    ).rejects.toThrow('Authentication required')
  })
})
