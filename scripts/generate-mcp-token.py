#!/usr/bin/env python3
"""
Generate a fresh Scalekit Virtual MCP session token.

This is the most reliable way (matches the official Scalekit docs).

Usage:
    python scripts/generate-mcp-token.py

Requirements:
    pip install scalekit-sdk-python python-dotenv

The script will:
- Load .env.local if python-dotenv is installed
- Mint a short-lived session token for your Virtual MCP
- Print a ready-to-paste config for Vapi's MCP tool
"""

import os
import sys
from datetime import timedelta

try:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
except ImportError:
    print("⚠️  python-dotenv not installed. Make sure your environment variables are loaded.")
    print("   You can install it with: pip install python-dotenv scalekit-sdk-python\n")

try:
    from scalekit import ScalekitClient
except ImportError:
    print("❌ scalekit-sdk-python is not installed.")
    print("   Run: pip install scalekit-sdk-python python-dotenv")
    sys.exit(1)

def main():
    env_url = os.getenv("SCALEKIT_ENV_URL")
    client_id = os.getenv("SCALEKIT_CLIENT_ID")
    client_secret = os.getenv("SCALEKIT_CLIENT_SECRET")
    config_id = os.getenv("SCALEKIT_MCP_CONFIG_ID")
    identifier = os.getenv("TEST_IDENTIFIER") or os.getenv("NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID")
    server_url = os.getenv("NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL")

    if not all([env_url, client_id, client_secret, config_id, identifier]):
        print("❌ Missing required environment variables.")
        print("   Required: SCALEKIT_ENV_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET,")
        print("             SCALEKIT_MCP_CONFIG_ID, TEST_IDENTIFIER")
        sys.exit(1)

    if not server_url:
        print("⚠️  NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL not set in .env.local")
        print("   You can still generate the token. Set it later to get the full Vapi config.")

    print("🔐 Generating fresh Virtual MCP session token...")
    print(f"   Config ID : {config_id}")
    print(f"   Identifier: {identifier}")

    scalekit = ScalekitClient(env_url, client_id, client_secret)

    try:
        token_response = scalekit.actions.mcp.create_session_token(
            mcp_config_id=config_id,
            identifier=identifier,
            expiry=timedelta(hours=1),
        )
        token = token_response.token
    except Exception as e:
        print(f"❌ Failed to mint token: {e}")
        print("\nMake sure:")
        print("  - The Virtual MCP config exists in Scalekit")
        print("  - Your identifier has active connections for the mapped tools")
        print("  - You are using the correct config ID")
        sys.exit(1)

    print("\n✅ Fresh token generated!")
    print(f"Token: {token}")

    if server_url:
        vapi_config = {
            "server": {
                "url": server_url,
                "headers": {
                    "Authorization": f"Bearer {token}"
                }
            }
        }
        print("\n📋 Copy this for your Vapi MCP tool:")
        import json
        print(json.dumps(vapi_config, indent=2))
    else:
        print("\n⚠️  NEXT_PUBLIC_SCALEKIT_MCP_SERVER_URL is not set.")
        print("   Use your mcp_server_url + this token in Vapi:")
        print(f'   headers: {{ "Authorization": "Bearer {token}" }}')

    print("\nIn Vapi dashboard:")
    print("  - Create or edit an MCP tool")
    print("  - Paste the server.url and Authorization header above")
    print("  - Attach the tool to your assistant")
    print("  - Regenerate the token before each test (they expire quickly)")

if __name__ == "__main__":
    main()
