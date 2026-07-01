import { NextRequest, NextResponse } from 'next/server';
import { ScalekitClient } from '@scalekit-sdk/node';

let scalekitClient: ScalekitClient | null = null;

function getScalekit() {
  if (!scalekitClient) {
    const envUrl = process.env.SCALEKIT_ENV_URL;
    const clientId = process.env.SCALEKIT_CLIENT_ID;
    const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;

    if (!envUrl || !clientId || !clientSecret) {
      throw new Error(
        'Missing SCALEKIT_ENV_URL, SCALEKIT_CLIENT_ID or SCALEKIT_CLIENT_SECRET. ' +
          'Set them in .env.local (server-side only).'
      );
    }
    scalekitClient = new ScalekitClient(envUrl, clientId, clientSecret);
  }
  return scalekitClient;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message || body;

  console.log('[Vapi Webhook] Received:', JSON.stringify(message, null, 2));

  // Vapi sends tool-calls in this shape (tool-calls or legacy function-call)
  const toolCalls: unknown[] = message.toolCallList || (message.functionCall ? [message.functionCall] : []);

  if (toolCalls.length > 0) {
    const results: { toolCallId?: string; result: unknown }[] = [];

    for (const raw of toolCalls) {
      const toolCall = raw as Record<string, unknown>;
      const toolName = (toolCall.name as string) || ((toolCall.function as Record<string, unknown>)?.name as string) || '';
      const args = (toolCall.arguments as Record<string, unknown>) || (toolCall.parameters as Record<string, unknown>) || {};

      // The crucial part: the frontend must pass scalekitConnectionId (or user identifier) in metadata
      const metadata = (message.metadata as Record<string, unknown>) || {};
      const identifier =
        (metadata.scalekitConnectionId as string) ||
        (metadata.userId as string) ||
        process.env.TEST_IDENTIFIER ||
        'test-user';

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
        const scalekit = getScalekit();
        const nameStr = typeof toolName === 'string' ? toolName : '';
        let scalekitToolName = nameStr;
        if (nameStr === 'check_calender_email' || nameStr.includes('calendar') || nameStr.includes('calender')) {
          scalekitToolName = 'googlecalendar_list_events';
        }
        const toolInput =
          ((args as Record<string, unknown>).toolInput as Record<string, unknown> | undefined) || (args as Record<string, unknown>);
        const result = await scalekit.actions.executeTool({
          connector: 'googlecalendar',
          identifier,
          toolName: scalekitToolName,
          toolInput,
        });

        const execResult = result as { data?: unknown } | null;
        results.push({
          toolCallId: (toolCall.id as string) || (toolCall.toolCallId as string),
          result: execResult?.data ?? result,
        });
      } catch (err: unknown) {
        console.error('[Vapi Webhook] Scalekit tool error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Tool execution failed';
        results.push({
          toolCallId: (toolCall.id as string) || (toolCall.toolCallId as string),
          result: { error: errorMessage },
        });
      }
    }

    return NextResponse.json({ results });
  }

  // Default success for other events (call start, etc.)
  return NextResponse.json({ success: true });
}
