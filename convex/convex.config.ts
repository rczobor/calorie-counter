import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import mcp from '@convex-dev/mcp/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'

const app = defineApp({
  env: {
    MCP_CONSENT_URL: v.optional(v.string()),
    // Comma-separated `users` ids that may open the usage dashboard.
    SUPER_ADMIN_USER_IDS: v.optional(v.string()),
    // Claude API key for describing meals in the editor; unset hides the feature.
    ANTHROPIC_API_KEY: v.optional(v.string()),
  },
})
app.use(mcp)
app.use(rateLimiter)
export default app
