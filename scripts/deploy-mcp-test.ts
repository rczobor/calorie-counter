import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { resolveConvexCliPath } from './seed-defaults.ts'

export function deployMcpTest(
  directory = process.cwd(),
  deploy = (cwd: string) => {
    const child = spawnSync(
      process.execPath,
      [
        resolveConvexCliPath(),
        'dev',
        '--once',
        '--env-file',
        '.env.mcp-test.local',
      ],
      { cwd, stdio: 'inherit' },
    )
    if (child.error) throw child.error
    return child.status ?? 1
  },
) {
  const selected = parseEnv(
    readFileSync(join(directory, '.env.mcp-test.local'), 'utf8'),
  )
  const overrides = [
    'CONVEX_DEPLOY_KEY',
    'CONVEX_SELF_HOSTED_URL',
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
  ]
  if (
    selected.CONVEX_DEPLOYMENT !== 'dev:dapper-ibis-334' ||
    (process.env.CONVEX_DEPLOYMENT &&
      process.env.CONVEX_DEPLOYMENT !== selected.CONVEX_DEPLOYMENT) ||
    overrides.some((key) => process.env[key] || selected[key])
  ) {
    throw new Error(
      'Refusing to deploy: select only dev:dapper-ibis-334 without deploy-key or self-hosted overrides.',
    )
  }
  const localPath = join(directory, '.env.local')
  const original = existsSync(localPath)
    ? { bytes: readFileSync(localPath), mode: statSync(localPath).mode }
    : null
  try {
    return deploy(directory)
  } finally {
    // Convex dev updates .env.local even when another file selects the target.
    if (original) {
      writeFileSync(localPath, original.bytes)
      chmodSync(localPath, original.mode)
    } else {
      rmSync(localPath, { force: true })
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = deployMcpTest()
}
