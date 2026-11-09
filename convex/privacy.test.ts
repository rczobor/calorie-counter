// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import { PRIVACY_NOTICE_VERSION } from './lib/privacy'
import {
  createConvexTest,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

function signedIn(t: ReturnType<typeof createConvexTest>) {
  return t.withIdentity({ tokenIdentifier: TEST_TOKEN_IDENTIFIER })
}

describe('privacy consent', () => {
  it('records consent to the current notice once and refuses an outdated one', async () => {
    const t = createConvexTest()
    const user = signedIn(t)
    expect(await user.query(api.privacy.consent, {})).toEqual({
      accepted: false,
    })
    await expect(
      user.mutation(api.privacy.accept, { version: '2020-01-01' }),
    ).rejects.toThrow('The privacy notice has changed')

    await user.mutation(api.privacy.accept, { version: PRIVACY_NOTICE_VERSION })
    await user.mutation(api.privacy.accept, { version: PRIVACY_NOTICE_VERSION })
    expect(await user.query(api.privacy.consent, {})).toEqual({
      accepted: true,
    })
    expect(
      await t.run((ctx) => ctx.db.query('privacyConsents').collect()),
    ).toMatchObject([{ version: PRIVACY_NOTICE_VERSION }])
  })

  it('keeps household data locked until the account accepts', async () => {
    const t = createConvexTest()
    const user = signedIn(t)
    await user.mutation(api.households.ensurePersonal, {})
    const list = () =>
      user.query(api.people.list, {
        archived: false,
        paginationOpts: { numItems: 10, cursor: null },
      })
    await expect(list()).rejects.toThrow(
      'Accept the privacy notice in the app to continue.',
    )
    await user.mutation(api.privacy.accept, { version: PRIVACY_NOTICE_VERSION })
    expect((await list()).page).toEqual([])
  })

  it('requires a signed-in account', async () => {
    const t = createConvexTest()
    await expect(t.query(api.privacy.consent, {})).rejects.toThrow(
      'Authentication required',
    )
    await expect(
      t.mutation(api.privacy.accept, { version: PRIVACY_NOTICE_VERSION }),
    ).rejects.toThrow('Authentication required')
  })
})
