import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

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
  if (!ownerTokenIdentifier) {
    throw new Error(
      'SEED_OWNER_TOKEN_IDENTIFIER is required when seed arguments are omitted.',
    )
  }
  const args = {
    ...(ownerUserId ? { ownerUserId } : {}),
    ownerTokenIdentifier,
  }

  return [JSON.stringify(args)]
}

export function parseSeedEnvFile(contents: string): SeedDefaultsEnv {
  const parsed = parseEnv(contents)
  const env: SeedDefaultsEnv = {}
  if (parsed.SEED_OWNER_USER_ID !== undefined) {
    env.SEED_OWNER_USER_ID = parsed.SEED_OWNER_USER_ID
  }
  if (parsed.SEED_OWNER_TOKEN_IDENTIFIER !== undefined) {
    env.SEED_OWNER_TOKEN_IDENTIFIER = parsed.SEED_OWNER_TOKEN_IDENTIFIER
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

export function resolveConvexCliPath() {
  const packageJsonPath = fileURLToPath(
    import.meta.resolve('convex/package.json'),
  )
  return join(dirname(packageJsonPath), 'bin', 'main.js')
}

export function createConvexCliInvocation(convexArgs: string[]) {
  return {
    command: process.execPath,
    args: [resolveConvexCliPath(), 'run', 'seed:defaults', ...convexArgs],
  }
}

export async function runSeedDefaults(rawArgs = process.argv.slice(2)) {
  const convexArgs = buildSeedDefaultsArgs(
    process.env,
    rawArgs,
    readLocalSeedEnv(),
  )
  const invocation = createConvexCliInvocation(convexArgs)
  const child = spawn(invocation.command, invocation.args, {
    stdio: 'inherit',
  })

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
