import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { env, httpAction } from './_generated/server'
import { DomainError, normalizeRequiredDate } from './lib/validation'
import { mcp } from './mcp'
import { hashWidgetToken } from './widgets'

const http = httpRouter()
if (env.MCP_CONSENT_URL) mcp.registerRoutes(http)

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

// Home Screen widgets read one person's day. The device supplies its own
// calendar date, so the widget follows the phone's time zone.
http.route({
  path: '/widget/today',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const token = /^Bearer (\S+)$/.exec(
      request.headers.get('Authorization') ?? '',
    )?.[1]
    if (!token || token.length > 100)
      return json(401, { error: 'Missing widget token.' })
    let eatenOn: string
    try {
      eatenOn = normalizeRequiredDate(
        new URL(request.url).searchParams.get('date') ?? '',
        'date',
      )
    } catch (error) {
      if (error instanceof DomainError)
        return json(400, { error: error.message })
      throw error
    }
    const result = await ctx.runQuery(internal.widgets.readDay, {
      tokenHash: await hashWidgetToken(token),
      eatenOn,
    })
    if (result.status === 'removed')
      return json(401, {
        error: 'This widget was removed. Create a new one in the app.',
      })
    // Not removed: the widget works again once the account acts in the app,
    // so it must not send people off to create duplicates.
    if (result.status === 'paused')
      return json(403, { error: 'Open Calorie Counter to continue.' })
    return json(200, result.day)
  }),
})

export default http
