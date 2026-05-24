import { describe, expect, it } from 'vitest'

import {
  buildSeedDefaultsArgs,
  parseSeedEnvFile,
} from '../../scripts/seed-defaults'

describe('seed defaults script args', () => {
  it('preserves explicit Convex run args', () => {
    expect(
      buildSeedDefaultsArgs(
        {
          SEED_OWNER_USER_ID: 'user_from_env',
        },
        ['{"ownerUserId":"user_from_cli"}'],
      ),
    ).toEqual(['{"ownerUserId":"user_from_cli"}'])
  })

  it('forwards local seed owner env as Convex function args', () => {
    expect(
      buildSeedDefaultsArgs(
        {
          SEED_OWNER_USER_ID: '  user_123  ',
          SEED_OWNER_TOKEN_IDENTIFIER: '  issuer|user_123  ',
        },
        [],
      ),
    ).toEqual([
      '{"ownerUserId":"user_123","ownerTokenIdentifier":"issuer|user_123"}',
    ])
  })

  it('omits blank local seed env values', () => {
    expect(
      buildSeedDefaultsArgs(
        {
          SEED_OWNER_USER_ID: '  ',
          SEED_OWNER_TOKEN_IDENTIFIER: '',
        },
        [],
      ),
    ).toEqual([])
  })

  it('uses parsed env file values when shell env is missing', () => {
    expect(
      buildSeedDefaultsArgs(
        {},
        [],
        {
          SEED_OWNER_USER_ID: 'user_from_file',
        },
      ),
    ).toEqual(['{"ownerUserId":"user_from_file"}'])
  })

  it('prefers shell env over parsed env file values', () => {
    expect(
      buildSeedDefaultsArgs(
        {
          SEED_OWNER_USER_ID: 'user_from_shell',
        },
        [],
        {
          SEED_OWNER_USER_ID: 'user_from_file',
        },
      ),
    ).toEqual(['{"ownerUserId":"user_from_shell"}'])
  })
})

describe('seed env file parsing', () => {
  it('extracts quoted seed variables from dotenv content', () => {
    expect(
      parseSeedEnvFile(`
        # ignored
        VITE_CONVEX_URL=https://example.test
        SEED_OWNER_USER_ID="user_123"
        export SEED_OWNER_TOKEN_IDENTIFIER='issuer|user_123'
      `),
    ).toEqual({
      SEED_OWNER_USER_ID: 'user_123',
      SEED_OWNER_TOKEN_IDENTIFIER: 'issuer|user_123',
    })
  })
})
