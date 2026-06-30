import { NextRequest, NextResponse } from 'next/server';
import { ScalekitClient } from '@scalekit-sdk/node';

const scalekit = new ScalekitClient(
  process.env.SCALEKIT_ENV_URL!,
  process.env.SCALEKIT_CLIENT_ID!,
  process.env.SCALEKIT_CLIENT_SECRET!
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message || body;

  console.log('[Vapi Webhook] Received:', JSON.stringify(message, null, 2));

  // Vapi sends tool-calls in this shape
  const toolCalls = message.toolCallList || (message.functionCall ? [message.functionCall] : []);

  if (toolCalls.length > 0) {
    const results = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.name || toolCall.function?.name;
      const args = toolCall.arguments || toolCall.parameters || {};

      // The crucial part: the frontend must pass scalekitConnectionId (or user identifier) in metadata
      const metadata = message.metadata || {};
      const identifier = metadata.scalekitConnectionId || metadata.userId || process.env.TEST_IDENTIFIER || 'test-user';

      // Map the name Vapi sent to the canonical Scalekit tool name for the connector.
      // Best practice: create the Vapi Function tool with name "googlecalendar_list_events"
      // so this mapping becomes a no-op. The fallback keeps the demo resilient during development.
      //
      // Scalekit executeTool (per current AgentKit docs): primarily { toolName, identifier, toolInput }.
      // toolName includes the connector prefix (e.g. "googlecalendar_list_events").
      // `connector` here provides explicit grouping (accepted in this SDK version for the bridge pattern).
      // Result often surfaces data under `.data`; we normalize for Vapi.
      console.log(`[Vapi Webhook] Executing Scalekit tool: ${toolName} for identifier: ${identifier}`);

      try {
        let scalekitToolName = toolName;
        if (toolName === 'check_calender_email' || toolName.includes('calendar') || toolName.includes('calender')) {
          scalekitToolName = 'googlecalendar_list_events';
        }
        const result = await scalekit.actions.executeTool({
          connector: 'googlecalendar',
          identifier,
          toolName: scalekitToolName,
          toolInput: args.toolInput || args,  // support the wrapper or direct
        });

        results.push({
          toolCallId: toolCall.id || toolCall.toolCallId,
          result: (result as any).data ?? result,
        });
      } catch (err: any) {
        console.error('[Vapi Webhook] Scalekit tool error:', err);
        results.push({
          toolCallId: toolCall.id || toolCall.toolCallId,
          result: { error: err.message || 'Tool execution failed' },
        });
      }
    }

    return NextResponse.json({ results });
  }

  // Default success for other events (call start, etc.)
  return NextResponse.json({ success: true });
}
