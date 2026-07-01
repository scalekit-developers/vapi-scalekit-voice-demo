# Demo Scripts

This directory contains helper scripts to generate fresh Scalekit Virtual MCP session tokens.

These are needed because:
- Vapi's MCP tools require a `server.url` + `Authorization: Bearer <token>`
- Tokens are short-lived and must be generated per identifier / per test

---

## generate-mcp-token.py (Recommended)

Uses the official high-level Scalekit SDK method shown in the docs.

### Setup

```bash
pip install scalekit-sdk-python python-dotenv
```

### Usage

```bash
python scripts/generate-mcp-token.py
```

The script will try to load `.env.local` automatically (via python-dotenv).

If `python-dotenv` is not installed, make sure your environment variables are already exported.

### Output

It prints a ready-to-use config for Vapi:

```json
{
  "server": {
    "url": "https://...scalekit.../mcp/v3/servers/...",
    "headers": {
      "Authorization": "Bearer <fresh-token>"
    }
  }
}
```

---

## generate-mcp-token.js

Node.js version (no extra dependencies).

### Usage

```bash
node --env-file=.env.local scripts/generate-mcp-token.js
```

### When to use

Use this if you prefer to stay in Node. It tries the management API directly.  
If it fails with "Not Found", fall back to the Python script (more reliable for Virtual MCP right now).

---

## After generating a token

1. Copy the `server` object.
2. In the **Vapi dashboard**, when creating or editing an **MCP** tool:
   - Paste the `url`
   - Add the header `Authorization: Bearer <token>`
3. Attach the MCP tool to your assistant.
4. **Always generate a fresh token** before testing — they expire quickly.

### Requirements in .env.local

```env
SCALEKIT_MCP_CONFIG_ID=cfg_...
NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL=https://.../mcp/v3/servers/...
TEST_IDENTIFIER=saif.shaik@scalekit.com
```

Make sure the connections behind your Virtual MCP are **ACTIVE** for the identifier.
