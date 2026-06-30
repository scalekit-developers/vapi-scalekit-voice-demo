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

    vapi.on('error', (e: any) => {
      console.error('Vapi error:', e);
      setIsConnecting(false);
      setIsCallActive(false);
      const msg = e?.message || e?.error || 'Connection failed (check console and Vapi logs)';
      setTranscript((prev) => [...prev, `❌ Error: ${msg}`]);
    });

    vapi.on('message', (msg: any) => {
      if (msg.type === 'transcript') {
        setTranscript((prev) => [...prev, `${msg.role}: ${msg.transcript}`]);
      }
      if (msg.type === 'function-call') {
        setTranscript((prev) => [...prev, `→ Tool invoked: ${msg.functionCall?.name}`]);
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
          <div>• In the Vapi dashboard, create a <strong>Function</strong> tool named <code>googlecalendar_list_events</code> whose Server URL points to your ngrok URL + <code>/api/vapi/webhook</code>.</div>
          <div>• Attach that exact tool to the assistant and include a prompt telling the model to call <code>googlecalendar_list_events</code> for calendar questions.</div>
          <div>• The webhook will forward to Scalekit using the <code>scalekitConnectionId</code> from metadata.</div>
        </div>
      </div>
    </div>
  );
}
