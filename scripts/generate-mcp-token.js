#!/usr/bin/env node

/**
 * Generate a fresh Scalekit Virtual MCP session token for the demo.
 *
 * Usage (recommended):
 *   node --env-file=.env.local scripts/generate-mcp-token.js
 *
 * Note: The script assumes environment variables are already loaded
 * (via --env-file or your shell). It no longer requires the 'dotenv' package.
 *
 * This script:
 * 1. Loads your .env.local
 * 2. Gets a management token
 * 3. Tries to mint a per-user session token for your Virtual MCP config
 * 4. Prints a ready-to-paste config for Vapi's MCP tool (url + Authorization header)
 *
 * Why this script exists:
 * - The high-level SDK method (scalekit.actions.mcp.create_session_token) is not yet exposed
 *   in the current @scalekit-sdk/node version.
 * - The demo's API route may hit the same limitation.
 * - This gives you a working token quickly so you can test the Virtual MCP in Vapi.
 *
 * After running:
 * - Copy the printed "server" object.
 * - In Vapi Dashboard → Tools → your MCP tool → paste into the server config.
 * - Make sure you use a FRESH token (they expire).
 */

const { ScalekitClient } = require('@scalekit-sdk/node');

async function main() {
  const envUrl = process.env.SCALEKIT_ENV_URL;
  const clientId = process.env.SCALEKIT_CLIENT_ID;
  const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;
  const configId = process.env.SCALEKIT_MCP_CONFIG_ID;
  const identifier = process.env.TEST_IDENTIFIER || process.env.NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID;
  const serverUrl = process.env.NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL;

  if (!envUrl || !clientId || !clientSecret || !configId || !identifier) {
    console.error('❌ Missing required env vars. Make sure .env.local has:');
    console.error('   SCALEKIT_ENV_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET,');
    console.error('   SCALEKIT_MCP_CONFIG_ID, TEST_IDENTIFIER (or NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID)');
    process.exit(1);
  }

  if (!serverUrl) {
    console.warn('⚠️  NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL is not set.');
    console.warn('   The script will still print the token. You will need to combine it with your mcp_server_url manually.');
  }

  console.log('🔐 Generating fresh Virtual MCP session token...');
  console.log(`   Config ID: ${configId}`);
  console.log(`   Identifier: ${identifier}`);

  const scalekit = new ScalekitClient(envUrl, clientId, clientSecret);

  // Get a management token (client credentials)
  const managementToken = await scalekit.getClientAccessToken();

  // Try the most likely REST path for Virtual MCP session tokens.
  // (The high-level SDK method isn't available in this Node SDK version.)
  const path = `${envUrl.replace(/\/$/, '')}/api/v1/actions/mcp/configs/${configId}/session-tokens`;

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier,
      expiry: '1h',
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`❌ Failed to mint token (status ${res.status})`);
    console.error('Response:', text);

    console.log('\n📌 Fallback: Use this Python snippet (reliable per Scalekit docs):');
    console.log(`
from scalekit import ScalekitClient
from datetime import timedelta

scalekit_client = ScalekitClient(
    "${envUrl}",
    "${clientId}",
    "${clientSecret}",
)

token_response = scalekit_client.actions.mcp.create_session_token(
    mcp_config_id="${configId}",
    identifier="${identifier}",
    expiry=timedelta(hours=1),
)

token = token_response.token
print("Token:", token)
print()
print("Paste this into Vapi MCP tool:")
print('  server.url = "${serverUrl || 'YOUR_MCP_SERVER_URL'}')
print(f'  headers.Authorization = "Bearer {token}"')
`);

    console.log('\nAfter you have a token:');
    console.log('1. Put your real mcp_server_url in NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL in .env.local');
    console.log('2. In Vapi → Tools → your MCP tool:');
    console.log('   - server.url = the mcp_server_url from Scalekit');
    console.log('   - Add header: Authorization = Bearer <token>');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { raw: text };
  }

  const token = data.token || data.access_token || data.data?.token;

  if (!token) {
    console.error('❌ Token mint succeeded but no token field was returned.');
    console.error('Raw response:', text);
    process.exit(1);
  }

  console.log('\n✅ Fresh token generated!');
  console.log('Token:', token);

  const vapiServer = {
    url: serverUrl || 'PUT_YOUR_MCP_SERVER_URL_HERE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  const vapiConfig = { server: vapiServer };

  console.log('\n📋 Copy this for Vapi MCP tool (server config):');
  console.log(JSON.stringify(vapiConfig, null, 2));

  console.log('\nIn Vapi dashboard:');
  console.log('- Create/edit an MCP tool');
  console.log('- Paste the object above into the server settings');
  console.log('- Attach the tool to your assistant');
  console.log('- Use a fresh token every time you test (they are short-lived)');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
