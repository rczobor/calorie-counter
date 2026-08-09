import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  buildSeedDefaultsArgs,
  createConvexCliInvocation,
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

  it('rejects blank local seed token values', () => {
    expect(() =>
      buildSeedDefaultsArgs(
        {
          SEED_OWNER_USER_ID: '  ',
          SEED_OWNER_TOKEN_IDENTIFIER: '',
        },
        [],
      ),
    ).toThrow('SEED_OWNER_TOKEN_IDENTIFIER is required')
  })

  it('uses parsed env file values when shell env is missing', () => {
    const [arg] = buildSeedDefaultsArgs({}, [], {
      SEED_OWNER_USER_ID: 'user_from_file',
      SEED_OWNER_TOKEN_IDENTIFIER: 'issuer|user_from_file',
    })

    expect(JSON.parse(arg ?? '')).toEqual({
      ownerUserId: 'user_from_file',
      ownerTokenIdentifier: 'issuer|user_from_file',
    })
  })

  it('prefers shell env over parsed env file values', () => {
    const [arg] = buildSeedDefaultsArgs(
      {
        SEED_OWNER_USER_ID: 'user_from_shell',
        SEED_OWNER_TOKEN_IDENTIFIER: 'issuer|user_from_shell',
      },
      [],
      {
        SEED_OWNER_USER_ID: 'user_from_file',
      },
    )

    expect(JSON.parse(arg ?? '')).toEqual({
      ownerUserId: 'user_from_shell',
      ownerTokenIdentifier: 'issuer|user_from_shell',
    })
  })

  it('launches the local Convex CLI through the current Node executable', () => {
    const invocation = createConvexCliInvocation(['{"dryRun":true}'])

    expect(invocation.command).toBe(process.execPath)
    expect(existsSync(invocation.args[0] ?? '')).toBe(true)
    expect(invocation.args.slice(1)).toEqual([
      'run',
      'seed:defaults',
      '{"dryRun":true}',
    ])
  })
})

describe('seed env file parsing', () => {
  it('uses Node dotenv semantics and keeps only seed variables', () => {
    expect(
      parseSeedEnvFile(`
        # ignored
        VITE_CONVEX_URL=https://example.test
        SEED_OWNER_USER_ID="user_123"
        export SEED_OWNER_TOKEN_IDENTIFIER='issuer|user_123' # comment
      `),
    ).toEqual({
      SEED_OWNER_USER_ID: 'user_123',
      SEED_OWNER_TOKEN_IDENTIFIER: 'issuer|user_123',
    })
  })
})
