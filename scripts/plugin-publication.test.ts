// @vitest-environment node
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
function read(path: string) {
  return readFileSync(new URL(path, root), 'utf8')
}
function json(path: string): unknown {
  return JSON.parse(read(path))
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object')
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an array')
  return value
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Expected nonempty text')
  return value
}
function number(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Expected a finite number')
  return value
}

const manifest = object(json('plugins/calorie-counter/plugin.json'))
const extension = object(object(manifest.extensions)['com.openai'])
const listing = object(extension.interface)
const cases = object(object(extension.review).test_cases)
const positive = array(cases.positive).map(object)
const negative = array(cases.negative).map(object)
const config = object(json('plugins/calorie-counter/mcp.json'))
const servers = object(config.mcpServers)
const server = object(servers.nutrition)
const auth = object(object(object(server.extensions)['com.openai']).auth)

// Inspect declarations without loading the backend or contacting any deployment.
const source = ts.createSourceFile(
  'mcp.ts',
  read('convex/mcp.ts'),
  ts.ScriptTarget.Latest,
  true,
)
const tools = new Map<string, string>()
function visit(node: ts.Node) {
  if (
    ts.isPropertyAssignment(node) &&
    ts.isCallExpression(node.initializer) &&
    ts.isIdentifier(node.initializer.expression) &&
    node.initializer.expression.text === 'tool'
  ) {
    const definition = node.initializer.arguments[0]
    if (!definition || !ts.isObjectLiteralExpression(definition))
      throw new Error('Expected an inline tool definition')
    const scope = definition.properties.find(
      (field) => field.name?.getText(source) === 'scope',
    )
    if (
      !scope ||
      !ts.isPropertyAssignment(scope) ||
      !ts.isStringLiteral(scope.initializer)
    )
      throw new Error('Expected an explicit tool scope')
    tools.set(node.name.getText(source), scope.initializer.text)
  }
  ts.forEachChild(node, visit)
}
visit(source)

describe('local plugin publication contract', () => {
  it('keeps the listing within final submission text limits', () => {
    expect(text(manifest.name)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(text(manifest.name).length).toBeLessThanOrEqual(64)
    expect(text(manifest.version)).toMatch(/^\d+\.\d+\.\d+$/)
    expect(text(manifest.description).length).toBeLessThanOrEqual(1024)
    expect(text(listing.displayName).length).toBeLessThanOrEqual(30)
    expect(text(listing.shortDescription).length).toBeLessThanOrEqual(30)
    expect(text(listing.longDescription).length).toBeLessThanOrEqual(4000)
    const prompts = array(listing.defaultPrompt).map(text)
    expect(prompts.length).toBeGreaterThan(0)
    expect(prompts.length).toBeLessThanOrEqual(3)
    expect(new Set(prompts).size).toBe(prompts.length)
    for (const prompt of prompts) {
      expect(prompt.length).toBeLessThanOrEqual(128)
      expect(prompt).not.toMatch(/[\n\r\t]/)
    }
  })

  it('packages one discovered OAuth server with scopes covering its reviewed tools', () => {
    expect(Object.keys(servers)).toEqual(['nutrition'])
    expect(server.type).toBe('streamable-http')
    expect(auth.type).toBe('oauth')
    expect(object(auth.client).mode).toBe('dcr')
    const scopes = new Set([
      ...array(auth.baseScopes).map(text),
      ...array(auth.defaultScopes).map(text),
    ])
    expect(scopes.has('nutrition:read')).toBe(true)
    expect(tools.size).toBeGreaterThan(0)
    for (const scope of tools.values()) expect(scopes.has(scope)).toBe(true)
    for (const scope of scopes) expect([...tools.values()]).toContain(scope)
    expect(server.headers).toBeUndefined()
    expect(auth.clientSecret).toBeUndefined()
    expect(object(auth.client).clientSecret).toBeUndefined()
    expect(extension.apps).toBeUndefined()
    expect(extension.hooks).toBeUndefined()
    const skillPath = text(extension.onboardingSkill)
    expect(skillPath).toBe('./skills/get-started/SKILL.md')
    expect(read(`plugins/calorie-counter/${skillPath.slice(2)}`)).toContain(
      'get_logging_context',
    )
  })

  it('defines five positive and three negative cases using existing tools', () => {
    expect(positive).toHaveLength(5)
    expect(negative).toHaveLength(3)
    for (const entry of [...positive, ...negative]) {
      text(entry.description)
      text(entry.prompt)
      text(entry.expected_behavior)
      const names = text(entry.tools_triggered).split(/,\s*/)
      for (const name of names) {
        expect(tools.has(name), `Unknown reviewed tool: ${name}`).toBe(true)
      }
    }
    const audited = [
      ...read('docs/plugin-publication/tool-audit.md').matchAll(
        /^\|\s*`(\w+)`\s*\|/gm,
      ),
    ].map((match) => match[1])
    expect(audited.sort()).toEqual([...tools.keys()].sort())
    const results = object(json('docs/plugin-publication/review-results.json'))
    expect(results.packageVersion).toBe(manifest.version)
    expect(array(results.cases).map((entry) => object(entry).id)).toEqual(
      [...positive, ...negative].map(
        (entry) => text(entry.description).split(':')[0],
      ),
    )
  })

  it('uses credential-free HTTPS URLs in the package, including draft placeholders', () => {
    for (const value of [
      manifest.homepage,
      listing.websiteURL,
      listing.supportURL,
      listing.privacyPolicyURL,
      listing.termsOfServiceURL,
      server.url,
    ]) {
      const url = new URL(text(value))
      expect(url.protocol).toBe('https:')
      expect(url.username).toBe('')
      expect(url.password).toBe('')
      expect(url.search).toBe('')
      expect(url.hash).toBe('')
    }
    // Deliberately no assertion of reachability or publication readiness here.
  })

  it('keeps review fixture totals consistent with portions and cooked density', () => {
    const fixtures = object(
      json('docs/plugin-publication/reviewer-fixtures.json'),
    )
    const densities = new Map<string, number>()
    for (const item of array(fixtures.ingredients).map(object))
      densities.set(text(item.name), number(item.kcalPer100Grams))
    for (const food of array(fixtures.cookedFoods).map(object)) {
      const total = array(food.ingredients).reduce<number>((sum, raw) => {
        const item = object(raw)
        return sum + (number(item.grams) * number(item.kcalPer100Grams)) / 100
      }, 0)
      expect(total).toBe(number(food.expectedTotalCalories))
      const density = (total / number(food.finishedWeightGrams)) * 100
      expect(density).toBe(number(food.expectedKcalPer100Grams))
      densities.set(text(food.name), density)
    }
    const cooking = object(fixtures.cookingCase)
    const batchCalories =
      (number(cooking.rawWeightGrams) *
        number(densities.get(text(cooking.ingredient)))) /
      100
    expect(batchCalories).toBe(number(cooking.expectedTotalCalories))
    const cookedDensity =
      (batchCalories / number(cooking.finishedWeightGrams)) * 100
    expect(cookedDensity).toBe(number(cooking.expectedKcalPer100Grams))
    for (const portion of array(cooking.portions).map(object))
      expect((number(portion.grams) * cookedDensity) / 100).toBe(
        number(portion.expectedCalories),
      )
    const correction = object(fixtures.correctionMeal)
    const calories = array(correction.items).reduce<number>((sum, raw) => {
      const item = object(raw)
      return (
        sum +
        (number(item.grams) * number(densities.get(text(item.food)))) / 100
      )
    }, 0)
    expect(calories).toBe(number(correction.expectedCalories))
    expect(
      calories -
        (number(correction.uneatenBreadGrams) *
          number(densities.get('Review Bread'))) /
          100,
    ).toBe(number(correction.expectedCorrectedCalories))
    const fixed = object(fixtures.fixedFood)
    expect(number(fixed.caloriesPerServing) * 2).toBe(
      number(fixed.expectedCaloriesAfterTwoServings),
    )
  })
})
