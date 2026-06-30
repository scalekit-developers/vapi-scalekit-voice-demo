# Vapi + Scalekit Integration Progress Tracker

**Goal**: Integrate Vapi (for natural voice AI assistants / web & phone calls) with Scalekit AgentKit (for secure, per-user authenticated tool calling to third-party services like Google Calendar, Gmail, Slack, etc.) without exposing raw OAuth tokens to the LLM or Vapi.

**Core value**: Voice that can securely act on behalf of authenticated users using Scalekit's connection management + tool execution.

**Key docs sources** (LLM-optimized):
- https://docs.scalekit.com/llms.txt (routes to AgentKit, MCP, tools, executeTool, Virtual MCP, listScopedTools, etc.)
- https://docs.vapi.ai/llms.txt (Custom Function tools, MCP tools, metadata/variables, web SDK, tool call payloads/responses)

**Last updated**: 2026-06-30 (during scheduled tracking run)

---

## Current Implementation Status (Webhook Bridge - Phase 1)

**Location**: `vapi-scalekit-voice-demo/` (also published as standalone https://github.com/scalekit-developers/vapi-scalekit-voice-demo )

**Stack**:
- Next.js 16 + React 19 (App Router)
- `@vapi-ai/web` ^2.5.2 (client-side voice calls)
- `@scalekit-sdk/node` ^2.6.3 (server-side AgentKit actions)

**Working flow** (verified in demo + recording):
1. Browser UI uses Vapi Web SDK: `vapi.start(assistantId, { metadata: { scalekitConnectionId: "...", userId } })`
2. User speaks → Assistant decides to call tool (e.g. `googlecalendar_list_events`)
3. Vapi POSTs to configured Server URL (`/api/vapi/webhook`) with:
   - `message.type: "tool-calls"`
   - `toolCallList` or `functionCall`
   - `metadata` echoed from call start
4. Webhook:
   - Extracts `identifier = metadata.scalekitConnectionId || TEST_IDENTIFIER`
   - Maps incoming tool name (with fallback for dev names) → `googlecalendar_list_events`
   - Calls `scalekit.actions.executeTool({ connector: 'googlecalendar', identifier, toolName, toolInput: args })`
   - Returns exact Vapi-expected shape: `{ results: [{ toolCallId, result }] }`
5. Vapi feeds result back to LLM → spoken response to user.

**Files of note**:
- `app/page.tsx`: Vapi client, start with metadata (correct 2-arg form), transcript + state UI, basic hints.
- `app/api/vapi/webhook/route.ts`: The bridge. Handles tool-calls, identifier from metadata, executeTool, error results.
- `app/api/debug/tools/route.ts`: Uses `scalekit.tools.listScopedTools(identifier)` to show live available tools for the user.
- `.env.example`: Keys + `TEST_IDENTIFIER` / `NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID` + assistant ID.

**Validation against current docs**:
- Vapi Custom Function tool + webhook payload/response shape: **Exact match** to https://docs.vapi.ai/tools/custom-tools.md (toolCallList, arguments, `{results: [{toolCallId, result}]}`).
- Metadata passing: Supported and used correctly (Vapi forwards call metadata into tool messages).
- Scalekit AgentKit: `executeTool` + `listScopedTools` + `connector` + `identifier` pattern: Matches AgentKit tools overview and SDK.
- Tool naming: Current README emphasizes using the real Scalekit tool name (`googlecalendar_list_events`) + minimal mapper for dev resilience. Good.

**Demo readiness**: Fully functional for the calendar use case. Has ngrok requirement, dashboard config steps (exact tool name + attachment), debug endpoint, and screen recording link.

---

## Gaps & Observations (from latest docs)

**Strengths of current approach**:
- Full observability and control (everything goes through our webhook).
- Easy debugging and custom logic (name mapping, arg shaping, logging).
- Works with Vapi's existing Function tool contract today.
- Demonstrates the critical "identifier via metadata" pattern for per-user auth.

**Areas for improvement / evolution** (per docs):
1. **MCP Path (recommended long-term by Scalekit)**:
   - Scalekit Virtual MCP servers: Define once (scoped tools + connections), mint short-lived per-user Bearer tokens at runtime.
   - Vapi now supports native **MCP tools** (McpTool in assistant config / tool creation). See Vapi docs: MCP integration allows dynamically accessing tools from MCP servers.
   - Benefit: No custom webhook for tool discovery/execution. Vapi can discover tools from the MCP server URL + auth. Less glue code.
   - Current README already calls this out as next step #3.

2. **Identifier / auth passing**:
   - Demo relies on env + metadata. Production: derive from authenticated user session (Scalekit SaaSKit connection or your own auth after user authorizes the connector).
   - Vapi "static variables and aliases" (server-controlled values injected into tool calls, never seen by LLM) could be leveraged for extra safety when passing identifiers.

3. **Tool schema handling**:
   - Use `listScopedTools` output (input_schema, etc.) more dynamically instead of manually defining parameters in Vapi dashboard.
   - Support full range of tool names (remove hardcoded mapper over time).

4. **Vapi native integrations vs Scalekit**:
   - Vapi has built-in Google Calendar / Sheets / Slack integrations.
   - This project exists to demonstrate **Scalekit as the unified auth + tool layer** across many connectors with proper per-user OAuth vaulting.

5. **Other Vapi features to explore**:
   - Client-side tools (Web SDK) for some flows, but server-side preferred for auth.
   - Assistant hooks, background messages, variables for personalization.
   - `vapi listen` CLI for easier local webhook dev.

6. **Production / security**:
   - Validate webhook origin / signatures if Vapi provides (check latest).
   - Proper error surfaces that the voice assistant can speak.
   - Connection status UI in the frontend.
   - Rate limiting, timeouts on executeTool.

**Scalekit docs highlights injected**:
- Virtual MCP for scoping tools per agent role, reducing token bloat and enforcing least privilege.
- Per-user session tokens for MCP.
- executeTool is the direct low-level path (current demo); MCP is the higher-level dynamic discovery path.
- listScopedTools is the right way to discover what a given identifier can actually do.

---

## Next Steps (Prioritized)

From current README + fresh doc analysis:

1. **Real user auth flow**: Replace hardcoded `TEST_IDENTIFIER` + metadata with a flow where a logged-in user authorizes Google Calendar (via Scalekit) and the identifier comes from their session / connection.
2. **Dynamic tool mapping + schema**: Pull real tool definitions from `listScopedTools` or Scalekit and sync / describe them into Vapi tools (or use MCP for auto).
3. **MCP migration** (high value):
   - Create Virtual MCP server in Scalekit for googlecalendar (scoped to needed tools).
   - In Vapi, create an **MCP** tool pointing at the Scalekit MCP server URL + per-user token.
   - Compare latency / UX vs webhook bridge.
4. **UI/UX polish** (Emil-style): Connection status, "what tool was just called + result summary", better connecting states, transcript of tool actions.
5. **Multi-tool / multi-connector demo**: Extend beyond calendar (e.g. gmail + calendar).
6. **Error & async handling**: Proper request start/complete/failed messages in Vapi tool config. Support async tools if needed.
7. **Testing & docs**: Add automated checks for tool response shape. Keep README + this PROGRESS.md in sync with docs.
8. **Deployment**: Move beyond ngrok (Vercel + public URL, or Vapi CLI forwarder).

**Short-term quick wins**:
- Improve webhook to better surface Scalekit errors as speakable results.
- Document how to get exact tool names/schemas using the debug route before configuring Vapi.
- Update Vapi tool config instructions if Vapi dashboard has changed for MCP vs Function.

---

## How to Continue Development

```bash
cd vapi-scalekit-voice-demo
npm install
cp .env.example .env.local   # fill keys + identifiers
npm run dev
# other terminal
ngrok http 3000
# Visit localhost:3000 , configure dashboards per README
```

Debug tools live: `http://localhost:3000/api/debug/tools`

**References for future agents**:
- Always load the two llms.txt when making changes.
- Prefer Scalekit Virtual MCP + Vapi MCP tool for new work where possible.
- Keep the webhook bridge as the "explicit control" reference implementation.

**Tracked by**: Scheduled background progress task (recurring). This file is the source of truth for injecting status back.

---

**Status summary (as of this run)**:
- **Bridge implementation**: ✅ Complete & validated against current Vapi/Scalekit docs.
- **MCP evolution**: 📋 Documented, ready to implement.
- **Production auth**: ⚠️ Prototype only (env-based).
- **Overall**: Strong reference demo. Ready for community / Scalekit developers usage as starting point.
