import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

type SeedDefaultsEnv = {
  SEED_OWNER_USER_ID?: string
  SEED_OWNER_TOKEN_IDENTIFIER?: string
}

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function buildSeedDefaultsArgs(
  env: SeedDefaultsEnv,
  rawArgs: string[],
  fileEnv: SeedDefaultsEnv = {},
) {
  if (rawArgs.length > 0) {
    return rawArgs
  }

  const seedEnv = {
    ...fileEnv,
    ...env,
  }
  const ownerUserId = normalizeOptionalString(seedEnv.SEED_OWNER_USER_ID)
  const ownerTokenIdentifier = normalizeOptionalString(
    seedEnv.SEED_OWNER_TOKEN_IDENTIFIER,
  )
  const args = {
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(ownerTokenIdentifier ? { ownerTokenIdentifier } : {}),
  }

  return Object.keys(args).length > 0 ? [JSON.stringify(args)] : []
}

export function parseSeedEnvFile(contents: string): SeedDefaultsEnv {
  const env: SeedDefaultsEnv = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    )
    if (!match) {
      continue
    }

    const key = match[1]
    if (
      key !== 'SEED_OWNER_USER_ID' &&
      key !== 'SEED_OWNER_TOKEN_IDENTIFIER'
    ) {
      continue
    }

    const rawValue = match[2]?.trim() ?? ''
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue
    env[key] = value
  }
  return env
}

function readLocalSeedEnv() {
  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) {
    return {}
  }
  return parseSeedEnvFile(readFileSync(envPath, 'utf8'))
}

export async function runSeedDefaults(rawArgs = process.argv.slice(2)) {
  const convexArgs = buildSeedDefaultsArgs(
    process.env,
    rawArgs,
    readLocalSeedEnv(),
  )
  const child = spawn(
    'bun',
    [
      'x',
      '--no-install',
      '--bun',
      'convex',
      'run',
      'seed:defaults',
      ...convexArgs,
    ],
    {
      stdio: 'inherit',
    },
  )

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })

  process.exit(exitCode)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runSeedDefaults()
}
