# Vapi + Scalekit Voice + Tools Demo

A focused, production-oriented prototype showing how to combine **Vapi** (voice AI assistants) with **Scalekit AgentKit** (per-user authenticated tool calling).

**Goal of this project**: Let a voice assistant speak naturally and then securely perform real actions (e.g. list Google Calendar events) on behalf of an authenticated user — without ever exposing raw OAuth tokens to the LLM or the voice platform.

> **Demo recording**  
> [Watch the complete flow end-to-end](https://screen.studio/share/tFpYlmgB) — from starting the voice call in the browser, through Vapi tool invocation, the webhook bridge, authenticated Scalekit execution on Google Calendar, and the assistant speaking the results aloud.

## Getting Started

This is a standalone Next.js demo. You can clone it directly.

### Clone and install

```bash
git clone https://github.com/scalekit-developers/vapi-scalekit-voice-demo.git
cd vapi-scalekit-voice-demo

npm install

cp .env.example .env.local
```

Edit `.env.local` and fill in your actual keys (see the Environment Variables section for details and why each one exists).

Start the Next.js dev server:

```bash
npm run dev
```

In a second terminal, make your local server publicly reachable (Vapi is cloud-hosted and must be able to POST to your webhook):

```bash
ngrok http 3000
```

Copy the `https://...ngrok-free.dev` URL.

### Configure the two dashboards

**Vapi dashboard**
- Create (or reuse) an Assistant.
- Create a **Function** tool with these **exact** values:
  - **Name**: `googlecalendar_list_events` (must match the Scalekit tool)
  - **Description**: "List upcoming events from the user's Google Calendar"
  - **Parameters**: `calendar_id` (string, e.g. `"primary"`), `max_results` (number), `time_min`, `time_max`, `query` (optional)
  - **Server URL**: `https://your-ngrok-url.ngrok-free.dev/api/vapi/webhook`
- **Attach the tool** to your Assistant (Assistant editor → Tools or Model tools → add `googlecalendar_list_events`).
- Copy the **Assistant ID** into `NEXT_PUBLIC_VAPI_ASSISTANT_ID` in `.env.local`.
- Make sure the assistant's system prompt tells the model to use the tool for calendar questions (example below).

**Scalekit dashboard**
- Go to **AgentKit → Connections**.
- Create or verify a `googlecalendar` connection.
- Authorize it using the same identifier you put in `TEST_IDENTIFIER`.
- Confirm it shows as **Active**.

Restart `npm run dev` after editing `.env.local` so the public env vars are picked up.

### Quick test

Open http://localhost:3000.

Click **Start Voice Call** and say:

> "List my calendar events this week."

You should hear the assistant speak real events fetched through Scalekit for the connected user.

**See the full flow in action**: [Watch the demo recording](https://screen.studio/share/tFpYlmgB)

> **Progress tracking**: See `PROGRESS.md` in this repo for up-to-date status, doc references (Scalekit + Vapi llms.txt), implementation validation, gaps, and the MCP evolution path. This file is maintained by scheduled background tracking.

### Why these steps matter

- The exact tool name `googlecalendar_list_events` + proper attachment is required for Vapi to actually invoke your webhook.
- ngrok (or equivalent) is mandatory because Vapi calls your webhook over the public internet.
- The `scalekitConnectionId` is passed via Vapi call metadata and read server-side — this is how we securely identify which user's Google Calendar connection to use without exposing tokens.
- Using `.env.local` + `NEXT_PUBLIC_*` vars keeps secrets out of the browser while still letting the demo work immediately.

## Why This Integration Matters

Voice assistants are powerful for natural interaction, but they are useless for real work unless they can act on the user's behalf in external systems (Gmail, Calendar, Slack, CRM, etc.).

Two hard problems appear immediately:

1. **Authentication & Authorization** — The voice agent must act as a specific user. You cannot give the LLM long-lived tokens. You need short-lived, scoped, auditable access tied to a real human identity.
2. **Tool surface for voice** — Vapi needs to know what actions are possible and how to call them. The actions must be reliable, well-described, and return speakable results.

Scalekit AgentKit solves the first problem by providing:
- OAuth connection management per user (`identifier`)
- A clean `executeTool({ toolName, toolInput, identifier, connector })` surface
- Optional Virtual MCP servers for dynamic discovery

Vapi solves the voice part and supports two tool mechanisms:
- Custom Function tools (webhook-based)
- Native MCP tools

This demo deliberately starts with the **custom Function tool + webhook bridge** pattern because:
- It gives us full control and observability during early development.
- It is easy to debug (everything flows through one Next.js route).
- It works today without requiring Vapi to talk directly to Scalekit's MCP transport.
- We can later evolve to a pure MCP path or a hybrid.

The key "secret sauce" is **metadata**: when we start a Vapi call we pass `scalekitConnectionId` (our Scalekit `identifier`). Vapi forwards this metadata on every tool call. The webhook reads it and tells Scalekit "execute this action as this user".

## High-Level Architecture & Data Flow

```
User (browser)
   │
   │ 1. Clicks "Start Voice Call"
   ▼
Next.js UI (Vapi Web SDK)
   │
   │ 2. vapi.start(assistantId, { metadata: { scalekitConnectionId: "praneshtaker@gmail.com" } })
   ▼
Vapi Platform (voice model + ASR + TTS)
   │
   │ 3. User speaks: "List my calendar events this week"
   │ 4. Assistant decides to call tool "googlecalendar_list_events"
   │ 5. Vapi POSTs to our webhook with toolCalls + metadata
   ▼
Our Next.js Webhook (/api/vapi/webhook)
   │
   │ 6. Extract identifier from metadata
   │ 7. Call scalekit.actions.executeTool({
   │      connector: "googlecalendar",
   │      toolName: "googlecalendar_list_events",
   │      identifier,
   │      toolInput: { calendar_id: "primary", ... }
   │    })
   ▼
Scalekit AgentKit
   │
   │ 8. Looks up the user's active Google Calendar connection for that identifier
   │ 9. Executes the real Google Calendar API call (with short-lived token)
   │ 10. Returns structured result
   ▼
Webhook → Vapi
   │
   │ 11. Vapi receives result, LLM formulates spoken answer
   ▼
User hears the calendar events read out loud
```

**Why this shape?**
- All privileged work happens server-side in our code (we control the identifier).
- Vapi never sees tokens.
- Scalekit is the single source of truth for "who is allowed to do what".
- The voice model only sees tool names + descriptions + results — perfect for a voice UX.

## Prerequisites

- Node 18+
- A Scalekit environment with AgentKit enabled
- A Vapi account + at least one assistant
- ngrok (or any public tunnel) — Vapi must be able to reach your webhook
- A Google account that you can connect to Scalekit for testing (the identifier you will use)

## How This Demo Was Built (with "Why" at every decision)

These steps document how the project was originally created. They are useful for understanding the choices and for anyone who wants to recreate a similar project from scratch.

### 1. Create a clean Next.js app + install the two SDKs

```bash
npx create-next-app@latest vapi-scalekit-voice-demo --yes
cd vapi-scalekit-voice-demo
npm install @vapi-ai/web @scalekit-sdk/node
```

**Why?**
- We start fresh so we don't inherit unrelated complexity (billing, auth UI, etc.).
- `@vapi-ai/web` is the official browser SDK that gives us `new Vapi(publicKey)` and `vapi.start(...)`.
- `@scalekit-sdk/node` gives us the server-side client that knows how to talk to Scalekit AgentKit (`actions.executeTool`, connections, etc.).

### 2. Add environment variables

Copy the example and fill real values:

```bash
cp .env.example .env.local
```

Minimal required keys (see `.env.example` for full comments):

```env
NEXT_PUBLIC_VAPI_PUBLIC_KEY=pk_...
VAPI_PRIVATE_KEY=sk_...                 # only needed if you create tools via API

SCALEKIT_ENV_URL=...
SCALEKIT_CLIENT_ID=...
SCALEKIT_CLIENT_SECRET=...

# The "who" we are acting as in Scalekit.
# Must match an ACTIVE connected account you created in the Scalekit dashboard.
TEST_IDENTIFIER=praneshtaker@gmail.com
NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID=praneshtaker@gmail.com

NEXT_PUBLIC_VAPI_ASSISTANT_ID=...       # the assistant you will configure below
```

**Why two different variables for the identifier?**
- `TEST_IDENTIFIER` is read server-side in the webhook (safe).
- `NEXT_PUBLIC_*` is read in the browser so the UI can put it into the `metadata` object sent to Vapi.
- In a real product you would derive both from your authenticated user's session (e.g. after they log in with Scalekit or your own auth and then connect their Google account).

### 3. Understand the two moving pieces you will configure

You will configure things in **two different dashboards**:

A. **Vapi dashboard**
   - Create (or reuse) an Assistant.
   - Create a **Function** tool.
   - Give the tool a `server.url` that points at your publicly reachable webhook.
   - Attach the tool to the assistant.
   - Write a system prompt that tells the model when to use the tool.

B. **Scalekit dashboard**
   - Create a connection of type **Google Calendar** for your test identifier.
   - Authorize it (the user must complete Google OAuth).
   - Note the exact tool names Scalekit exposes (`googlecalendar_list_events`, etc.).

**Why two places?**
Vapi needs to know "what actions exist and how do I call them from a voice conversation?"
Scalekit needs to know "which real third-party accounts are linked to which of my users and what they are allowed to do?"

The webhook is the glue that translates between the two worlds.

### 4. Expose your local server (ngrok)

Vapi will call your webhook over the internet.

```bash
ngrok http 3000
```

Copy the `https://...ngrok-free.dev` URL. You will use it in the Vapi tool configuration.

**Why ngrok?**
Your laptop is not reachable from the public internet. ngrok (or Cloudflare Tunnel, localtunnel, etc.) gives you a stable public URL that forwards to `localhost:3000`.

### 5. Create / configure the Assistant and Tool in Vapi (exact values that work)

The tool name you define in Vapi **must** be the one your webhook will recognize and forward to Scalekit. The working name in this demo is:

> **`googlecalendar_list_events`**

1. In the Vapi dashboard, create or edit your Assistant.
2. Set a system prompt that explicitly instructs the model to use the tool. Recommended:

   ```
   You are a helpful personal assistant. 
   When the user asks about their calendar, events, or schedule, you MUST call 
   the googlecalendar_list_events tool.
   Always default to calendar_id "primary" unless the user names a different calendar.
   Keep responses concise and natural for voice.
   ```

3. Go to **Tools → Create Tool → Function** (or the equivalent tool creation flow).
4. Configure the Function tool with these exact settings:

   - **Name**: `googlecalendar_list_events`
   - **Description**: `List upcoming events from the user's Google Calendar.`
   - **Parameters** (add these so the model knows what it can send):
     - `calendar_id` (string) — e.g. `"primary"`
     - `max_results` (integer) — e.g. `10`
     - `time_min` (string, ISO datetime, optional)
     - `time_max` (string, ISO datetime, optional)
     - `query` (string, optional search term)
   - **Server URL**: `https://<your-ngrok-id>.ngrok-free.dev/api/vapi/webhook`

5. **Attach the tool to the assistant**:
   - Open the Assistant you want to use.
   - In the assistant editor, find the **Tools** section (or "Model" → tools / available tools).
   - Add/select the `googlecalendar_list_events` Function tool you just created.
   - Save the assistant.

6. Copy the Assistant's **ID** (it looks like `xxxx-xxxx-...`) and paste it into `.env.local` as `NEXT_PUBLIC_VAPI_ASSISTANT_ID`.

**Why tool name + attachment matters**
Vapi only sends the tool call if:
- The exact name you gave the Function matches what the model decides to invoke.
- The tool is attached to that specific assistant.
- The system prompt tells the model when and how to use it.

The webhook receives whatever `name` Vapi sends in the `tool-calls` payload.

**Pro tip**: Start the dev server and visit `http://localhost:3000/api/debug/tools` — it lists the real tool names (and descriptions) that Scalekit exposes for your `TEST_IDENTIFIER`. Use those names in Vapi for the cleanest mapping.

**Why the tool name must be exact (or mapped)**
When Vapi decides to call a tool it sends the `name`. The webhook (`app/api/vapi/webhook/route.ts`) currently does this:

```ts
let scalekitToolName = toolName;
if (toolName === 'check_calender_email' || toolName.includes('calendar') || toolName.includes('calender')) {
  scalekitToolName = 'googlecalendar_list_events';
}
...
await scalekit.actions.executeTool({
  connector: 'googlecalendar',
  identifier,
  toolName: scalekitToolName,
  toolInput: args.toolInput || args,
});
```

Prefer using `googlecalendar_list_events` directly in Vapi so the mapping is a no-op. The fallback exists only to make iteration easier.

### 6. Set up the Google Calendar connection in Scalekit

1. In Scalekit dashboard go to **AgentKit → Connections → Create Connection**.
2. Choose **Google Calendar**.
3. Follow the "Use your own credentials" flow (you will need a Google Cloud OAuth client with the Calendar API enabled).
4. After creating the connection, authorize it for your test identifier (`praneshtaker@gmail.com` or whatever you chose).
5. Make sure the connection shows as **Active**.

**Why we do this**
Scalekit becomes the secure broker. It stores the user's OAuth tokens, refreshes them, and only lets our code (the webhook) call Google on that user's behalf when we present the correct `identifier`.

### 7. Run the demo

```bash
npm run dev
```

Open http://localhost:3000.

Click **Start Voice Call**.

You should see:
- The button turn into "Connecting..." then "End Call"
- A green "Connected" indicator
- The transcript updating in real time

Speak: "List my calendar events this week."

If everything is wired correctly you will see in your terminal:

```
[Vapi Webhook] Received: { type: "tool-calls", ... }
[Vapi Webhook] Executing Scalekit tool: googlecalendar_list_events for identifier: praneshtaker@gmail.com
```

And a few seconds later the assistant will speak the events.

### How the Code Works (Deep Dive with Reasoning)

**Frontend – `app/page.tsx`**

- We create a single `Vapi` client with the public key (safe to put in the browser).
- We use React state to track `isConnecting` / `isCallActive` so the UI can give the user clear feedback. Voice UIs are opaque; good visual state is essential.
- `vapi.start(assistantId, { metadata })` — note that we pass the assistant **ID as the first argument**, not inside the object. Passing it inside the object used to produce the cryptic "assistant.property assistantId should not exist" error.
- We forward `scalekitConnectionId` in `metadata`. Vapi will echo this metadata on every tool call. This is the only place the user's identity travels from our authenticated context into the voice session.
- Event listeners (`call-start`, `call-end`, `error`, `message`) keep the UI in sync with reality instead of guessing.

**Backend – `app/api/vapi/webhook/route.ts`**

- Vapi calls this route with a `tool-calls` (or `function-call`) payload whenever the assistant decides to use a tool.
- We extract:
  - The tool name: `toolCall.name`
  - Arguments: `toolCall.arguments` (or `parameters`)
  - The user identity: `message.metadata.scalekitConnectionId` (falls back to `TEST_IDENTIFIER`)
- We map the incoming Vapi tool name to the real Scalekit tool name (currently `googlecalendar_list_events` for anything calendar-related), then call:

  ```ts
  await scalekit.actions.executeTool({
    connector: 'googlecalendar',
    identifier,
    toolName: scalekitToolName,   // e.g. 'googlecalendar_list_events'
    toolInput: args.toolInput || args,
  });
  ```

- We return the exact shape Vapi expects:

  ```json
  { "results": [ { "toolCallId": "...", "result": { ... } } ] }
  ```

Full relevant logic lives in `app/api/vapi/webhook/route.ts`. The route also logs the raw incoming message and the resolved tool name — watch your terminal during a call.

**Why we have a small name mapper right now**

- It makes the first successful end-to-end demo trivial even if your Vapi tool name is slightly different during iteration.
- The recommended (and simplest) approach is to name the Vapi Function tool exactly `googlecalendar_list_events`.
- Later you will make mapping dynamic or move to native MCP tools.

### Project Structure (Why we put things where we put them)

```
app/
├── page.tsx                 # Voice UI + all Vapi Web SDK interaction
├── api/
│   ├── vapi/webhook/route.ts   # The only place that talks to Scalekit
│   └── debug/tools/route.ts    # Convenience: list what tools the identifier can see
└── layout.tsx
```

- All privileged Scalekit calls live in server routes (never in client components).
- The UI only ever talks to Vapi (public key) and receives instructions via the assistant we configure in the dashboard.

### Troubleshooting (Common "Why did this happen?" cases)

| Symptom                              | Likely Cause & Why                                                                 |
|--------------------------------------|------------------------------------------------------------------------------------|
| 401 "Invalid Key"                    | You put the private key in `NEXT_PUBLIC_VAPI_PUBLIC_KEY` (or vice versa).         |
| `assistant.property assistantId should not exist` | You called `vapi.start({ assistantId, ... })` instead of `vapi.start(id, ...)`   |
| Tool call reaches webhook but Scalekit says "failed to get tool" | The name you used for the Function tool in Vapi does not match a tool that Scalekit exposes for the `googlecalendar` connector (or the mapping in the webhook didn't catch it). Use the debug endpoint to see the real names. |
| Tool executes but returns empty / error | The Google Calendar connection for the identifier is not active, or wrong `calendar_id`. |
| "Tool Result Still Pending" in Vapi  | Your webhook did not return `{ results: [...] }` in the exact shape Vapi expects. |
| No tool is ever called               | The assistant prompt does not tell the model to use the tool, or the tool is not attached. |

### Next Steps (the natural evolution of this prototype)

1. Replace the hardcoded demo metadata with a real authenticated Scalekit session (store the connection after the user authorizes Google Calendar).
2. Make the tool name mapping dynamic (inspect the incoming Vapi `name` and dispatch to the correct Scalekit `toolName` + `connector`). This way one webhook can serve many different tools.
3. Switch (or add) the pure MCP path:
   - Create a Virtual MCP config in Scalekit for Google Calendar.
   - In Vapi create an **MCP** tool pointing at the Scalekit MCP URL + a per-user Bearer token.
   - Remove the custom webhook for that tool.
4. Improve the voice UX (concise results, speak-state messages on the tool, better error handling that the assistant can read out loud).
5. Add Emil-style UI polish and guided learning (onboarding steps, "what just happened" explanations, connection status).
6. Extract reusable patterns (metadata helper, webhook router, connection flow) so this can become a reference template for other Vapi + Scalekit projects.

### Quick Commands

```bash
npm run dev
ngrok http 3000          # in another terminal
# Visit http://localhost:3000
```

Visit the debug endpoint while the server is running to see the **exact** tool names and descriptions available for your identifier (highly recommended before configuring Vapi):

```
http://localhost:3000/api/debug/tools
```

The `name` values returned here are what you should use (or map to) when creating the Function tool in Vapi. For Google Calendar the primary one is typically `googlecalendar_list_events`.

---

This README is intentionally verbose on the "why". The goal is that anyone (including future you) can understand not just *what* to type, but *why* each decision was made. That is the difference between a throw-away demo and a reference implementation you can build real products from.

Happy building! 🚀
