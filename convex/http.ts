import { httpRouter } from 'convex/server'
import { env } from './_generated/server'
import { mcp } from './mcp'

const http = httpRouter()
if (env.MCP_CONSENT_URL) mcp.registerRoutes(http)
export default http
