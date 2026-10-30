import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import mcp from '@convex-dev/mcp/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'

const app = defineApp({
  env: { MCP_CONSENT_URL: v.optional(v.string()) },
})
app.use(mcp)
app.use(rateLimiter)
export default app
