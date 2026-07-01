import { NextRequest, NextResponse } from 'next/server';
import { ScalekitClient } from '@scalekit-sdk/node';

let scalekitClient: ScalekitClient | null = null;

function getScalekit() {
  if (!scalekitClient) {
    const envUrl = process.env.SCALEKIT_ENV_URL;
    const clientId = process.env.SCALEKIT_CLIENT_ID;
    const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;

    if (!envUrl || !clientId || !clientSecret) {
      throw new Error('Missing SCALEKIT_* environment variables');
    }
    scalekitClient = new ScalekitClient(envUrl, clientId, clientSecret);
  }
  return scalekitClient;
}

const MCP_CONFIG_ID = process.env.SCALEKIT_MCP_CONFIG_ID;
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL;

export async function POST(req: NextRequest) {
  try {
    if (!MCP_CONFIG_ID) {
      return NextResponse.json(
        { error: 'SCALEKIT_MCP_CONFIG_ID is not set in .env.local' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const identifier =
      body.identifier ||
      process.env.TEST_IDENTIFIER ||
      process.env.NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID;

    if (!identifier) {
      return NextResponse.json(
        { error: 'No identifier provided (set TEST_IDENTIFIER or pass in body)' },
        { status: 400 }
      );
    }

    const scalekit = getScalekit();

    // Get management token
    const managementToken = await scalekit.getClientAccessToken();

    const base = process.env.SCALEKIT_ENV_URL!.replace(/\/$/, '');

    // 1. Check connected accounts for this config + identifier (recommended)
    let connectedAccounts: any = null;
    try {
      const checkRes = await fetch(
        `${base}/api/v1/actions/mcp/configs/${MCP_CONFIG_ID}/connected-accounts?identifier=${encodeURIComponent(identifier)}`,
        {
          headers: {
            Authorization: `Bearer ${managementToken}`,
          },
        }
      );
      if (checkRes.ok) {
        connectedAccounts = await checkRes.json();
      }
    } catch (e) {
      console.warn('Could not check connected accounts', e);
    }

    // 2. Mint fresh session token
    // The high-level SDK method (actions.mcp.create_session_token) is not exposed in the current Node SDK version.
    // We use direct REST with the management token. 
    // The path is based on Scalekit patterns for Virtual MCP.
    const path = `${base}/api/v1/actions/mcp/configs/${MCP_CONFIG_ID}/session-tokens`;

    const tokenRes = await fetch(path, {
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

    const lastErrText = await tokenRes.text();

    if (!tokenRes.ok) {
      console.error('Failed to mint MCP session token:', lastErrText);
      return NextResponse.json(
        {
          error: 'Failed to mint session token',
          details: lastErrText,
          hint: 'The REST path returned Not Found. The Node SDK does not yet expose actions.mcp.create_session_token. Use the Python example from the Scalekit docs (with your config_id) to get a working token quickly, then use it in Vapi.',
        },
        { status: 500 }
      );
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.token || tokenData.access_token || tokenData.data?.token;

    if (!token) {
      return NextResponse.json(
        { error: 'Token minting succeeded but no token was returned', raw: tokenData },
        { status: 500 }
      );
    }

    const serverUrl = MCP_SERVER_URL || null;

    const response: any = {
      identifier,
      configId: MCP_CONFIG_ID,
      serverUrl,
      token,
      connectedAccounts: connectedAccounts?.connected_accounts || connectedAccounts,
      note: 'Use a fresh token. Paste the server config into Vapi MCP tool.',
    };

    if (serverUrl && token) {
      response.vapiMcpServer = {
        url: serverUrl,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
      response.copyForVapi = JSON.stringify({ server: response.vapiMcpServer }, null, 2);
    } else if (serverUrl) {
      response.hint = `Set the token manually. Use this in Vapi: server.url = ${serverUrl}, Authorization: Bearer <token>`;
    } else {
      response.hint = 'Add NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL to .env.local';
    }

    // Always provide ready-to-run commands for the user
    response.commands = {
      node: `node --env-file=.env.local scripts/generate-mcp-token.js`,
      python: `python3 scripts/generate-mcp-token.py`,
    };

    return NextResponse.json(response);
  } catch (e: any) {
    console.error('MCP session error:', e);
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  }
}

// Convenience GET for browser testing (uses TEST_IDENTIFIER)
export async function GET() {
  return POST(
    new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({}),
    }) as any
  );
}
