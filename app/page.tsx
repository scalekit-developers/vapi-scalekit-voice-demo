'use client';

import { useState, useEffect } from 'react';
import Vapi from '@vapi-ai/web';

const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);

export default function VapiScalekitDemo() {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);

  // Set up listeners once
  useEffect(() => {
    vapi.on('call-start', () => {
      setIsConnecting(false);
      setIsCallActive(true);
      setTranscript((prev) => [...prev, '✅ Connected to Vapi. Speak to trigger a tool.']);
    });

    vapi.on('call-end', () => {
      setIsConnecting(false);
      setIsCallActive(false);
      setTranscript((prev) => [...prev, 'Call ended.']);
    });

    vapi.on('error', (e: unknown) => {
      console.error('Vapi error:', e);
      setIsConnecting(false);
      setIsCallActive(false);
      const errObj = e as { message?: string; error?: string } | null;
      const msg = errObj?.message || errObj?.error || 'Connection failed (check console and Vapi logs)';
      setTranscript((prev) => [...prev, `❌ Error: ${msg}`]);
    });

    vapi.on('message', (msg: unknown) => {
      const m = msg as { type?: string; role?: string; transcript?: string; functionCall?: { name?: string } } | null;
      if (m?.type === 'transcript') {
        setTranscript((prev) => [...prev, `${m.role}: ${m.transcript}`]);
      }
      if (m?.type === 'function-call') {
        setTranscript((prev) => [...prev, `→ Tool invoked: ${m.functionCall?.name}`]);
      }
    });

    // Cleanup not strictly needed for demo, but good practice
    return () => {
      // vapi.removeAllListeners(); // optional
    };
  }, []);

  const startCall = () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

    if (!publicKey || !assistantId) {
      alert('Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID in .env.local');
      return;
    }

    // In a real app, this would come from your logged-in user's Scalekit connection
    const metadata = {
      userId: 'demo-user-123',
      scalekitConnectionId: process.env.NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID || process.env.TEST_IDENTIFIER || 'demo-connection',
    };

    setIsConnecting(true);
    setTranscript(['Connecting to Vapi...']);

    // IMPORTANT: Pass assistantId as FIRST argument (string), not inside the object.
    // Passing { assistantId } causes "assistant.property assistantId should not exist"
    // The metadata object is forwarded by Vapi into tool-calls messages (see webhook).
    // (Future: static `parameters` on the Vapi tool def can inject trusted values server-side, bypassing LLM.)
    vapi.start(assistantId, {
      metadata,
    });
  };

  const endCall = () => {
    vapi.stop();
    setIsConnecting(false);
    setIsCallActive(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">Vapi + Scalekit</h1>
            <p className="text-zinc-400">Voice that can act on your behalf via authenticated tools.</p>
          </div>
          <div className="flex items-center gap-3">
            {isConnecting && (
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                Connecting...
              </div>
            )}
            {isCallActive && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Connected
              </div>
            )}
            <button
              onClick={isCallActive || isConnecting ? endCall : startCall}
              disabled={isConnecting}
              className={`px-5 py-2 rounded-full text-sm font-medium transition disabled:opacity-50 ${
                isCallActive ? 'bg-red-600' : 'bg-white text-black'
              }`}
            >
              {isConnecting ? 'Connecting...' : isCallActive ? 'End Call' : 'Start Voice Call'}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 min-h-[320px] font-mono text-sm overflow-auto">
          {transcript.length === 0 && !isConnecting && (
            <div className="text-zinc-500">Transcript will appear here once the call starts...</div>
          )}
          {transcript.map((line, idx) => (
            <div key={idx} className="py-0.5">{line}</div>
          ))}
          {isConnecting && (
            <div className="text-yellow-400">Connecting to Vapi... (watch browser console + Vapi dashboard for real-time logs)</div>
          )}
        </div>

        <div className="mt-6 text-xs text-zinc-500 space-y-1 leading-relaxed">
          <div>• Make sure <code>NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> and <code>NEXT_PUBLIC_VAPI_ASSISTANT_ID</code> are set.</div>
          <div>• For MCP mode (recommended for 1000+ tools): configure an **MCP** tool in Vapi pointing at your Scalekit Virtual MCP server URL + fresh `Authorization: Bearer &lt;token&gt;` header (see the panel below).</div>
          <div>• Or use a Function tool for specific tools (e.g. `googlecalendar_list_events`) pointing at your ngrok + `/api/vapi/webhook`.</div>
          <div>• Tool names must match tools registered in Scalekit (see AgentKit → Tools or the connection page).</div>
          <div>• The identifier from metadata tells Scalekit which user's connections to use.</div>
        </div>

        <div className="mt-4 text-[10px] text-zinc-400">
          <span className="font-medium text-zinc-300">Try saying (examples):</span> "What's on my calendar?", "Find emails from Acme", "Summarize #product on Slack", "Show my open PRs", "Find the roadmap doc and email it"
        </div>

        {/* Virtual MCP Helper */}
        <div className="mt-8 border border-zinc-800 rounded-2xl p-4 bg-zinc-900/50">
          <div>
            <div className="text-sm font-medium mb-1">Virtual MCP (Scalekit)</div>

            <div className="bg-zinc-950 p-3 rounded text-xs mb-3">
              <div className="text-emerald-400 mb-1">Run this command to get the token:</div>
              <div className="font-mono flex items-center gap-2">
                <span className="flex-1">python scripts/generate-mcp-token.py</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('python scripts/generate-mcp-token.py');
                    alert('Command copied!');
                  }}
                  className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 rounded"
                >
                  Copy cmd
                </button>
              </div>
              <div className="text-[9px] text-zinc-500 mt-1">or: node --env-file=.env.local scripts/generate-mcp-token.js</div>
            </div>

            <div className="text-[10px] text-zinc-400 mb-2">
              The script prints the token and the values you need.

          <details className="text-[10px] mb-3">
            <summary className="cursor-pointer font-medium text-emerald-400">Example output from the script (redacted)</summary>
            <pre className="bg-black p-2 mt-1 rounded text-[9px] overflow-auto">
{`🔐 Generating fresh Virtual MCP session token...
   Config ID : cfg_132114628359488085
   Identifier: saif.shaik@scalekit.com

✅ Fresh token generated!
Token: eyJhbGciOiJSUzI1NiIs... (redacted)

📋 Copy this for your Vapi MCP tool:
{
  "server": {
    "url": "https://scalekit-aefqjjrnaaafs-dev.scalekit.cloud/mcp/v3/servers/8e634412-5cca-4e18-807e-b537c89f8317",
    "headers": {
      "Authorization": "Bearer eyJhbGciOiJSUzI1NiIs... (redacted)"
    }
  }
}`}
            </pre>
          </details>
            </div>

            <div className="text-xs">
              <div className="font-medium mb-1">In Vapi Dashboard (when creating the MCP tool):</div>
              <div className="ml-1 space-y-1 text-[10px]">
                • <strong>Server URL</strong> field → paste the <code>mcp_server_url</code> from the script<br />
                • Look for <strong>Headers</strong> / <strong>Add Header</strong> / <strong>Custom Headers</strong> section<br />
                • Add HTTP header:
                <div className="ml-3 font-mono bg-zinc-950 px-1.5 py-0.5 rounded mt-0.5 inline-block text-[10px]">
                  Key: Authorization<br />
                  Value: Bearer &lt;token-from-script&gt;
                </div>
              </div>
            </div>
          </div>

          <div className="text-[9px] text-amber-400 mt-3">
            Use a fresh token every time (they expire quickly).
          </div>

          <div className="mt-3 pt-2 border-t border-zinc-800 text-[10px] text-zinc-400">
            <strong>In a real app:</strong> Your backend mints the token on the fly (e.g. in <code>/api/scalekit/mcp-session</code> when the user starts a voice call) using the Scalekit SDK. You then use Vapi's API (with <code>VAPI_PRIVATE_KEY</code>) to dynamically create/update the MCP tool with the fresh <code>server</code> config (url + Authorization header) and start the call. No manual scripts or dashboard edits needed.
          </div>
        </div>
      </div>
    </div>
  );
}
