import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { deployMcpTest } from './deploy-mcp-test'

const directories: string[] = []
function fixture(deployment = 'dev:dapper-ibis-334') {
  const directory = mkdtempSync(join(tmpdir(), 'mcp-deploy-'))
  directories.push(directory)
  writeFileSync(
    join(directory, '.env.mcp-test.local'),
    `CONVEX_DEPLOYMENT=${deployment}\n`,
  )
  return directory
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

it('restores ordinary local configuration byte-for-byte after a failed deploy', () => {
  const directory = fixture()
  const local = join(directory, '.env.local')
  const original =
    '# Keep local development\r\nCONVEX_DEPLOYMENT=anonymous:example\r\n'
  writeFileSync(local, original)
  expect(() =>
    deployMcpTest(directory, () => {
      writeFileSync(local, 'changed by Convex')
      throw new Error('Deploy failed')
    }),
  ).toThrow('Deploy failed')
  expect(readFileSync(local, 'utf8')).toBe(original)
})

it('removes only the CLI-created local file when none existed and preserves the exit code', () => {
  const directory = fixture()
  expect(
    deployMcpTest(directory, () => {
      writeFileSync(join(directory, '.env.local'), 'created by Convex')
      return 1
    }),
  ).toBe(1)
  expect(existsSync(join(directory, '.env.local'))).toBe(false)
})

it('rejects a different deployment before invoking the CLI', () => {
  let called = false
  expect(() =>
    deployMcpTest(fixture('prod:other'), () => {
      called = true
      return 0
    }),
  ).toThrow('Refusing to deploy')
  expect(called).toBe(false)
})

it.each([
  'CONVEX_DEPLOY_KEY',
  'CONVEX_SELF_HOSTED_URL',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
])('rejects %s in the selected file', (key) => {
  const directory = fixture()
  writeFileSync(
    join(directory, '.env.mcp-test.local'),
    `CONVEX_DEPLOYMENT=dev:dapper-ibis-334\n${key}=non-test-target\n`,
  )
  expect(() =>
    deployMcpTest(directory, () => {
      throw new Error('Must not deploy')
    }),
  ).toThrow('Refusing to deploy')
})
