import { NextResponse } from 'next/server';
import { ScalekitClient } from '@scalekit-sdk/node';

const scalekit = new ScalekitClient(
  process.env.SCALEKIT_ENV_URL!,
  process.env.SCALEKIT_CLIENT_ID!,
  process.env.SCALEKIT_CLIENT_SECRET!
);

export async function GET() {
  try {
    const identifier = process.env.TEST_IDENTIFIER || process.env.NEXT_PUBLIC_TEST_SCALEKIT_CONNECTION_ID || 'praneshtaker@gmail.com';
    
    // List scoped tools for this identifier - shows exactly what tools are available
    const [response] = await scalekit.tools.listScopedTools(identifier);
    const tools = response.tools || response || [];
    
    return NextResponse.json({
      identifier,
      count: tools.length,
      tools: tools.map((t: any) => ({
        name: t.name || t.toolName,
        description: t.description,
        // inputSchema: t.inputSchema or similar if present
      })),
      raw: tools  // full for debugging
    });
  } catch (e: any) {
    console.error('List tools error:', e);
    return NextResponse.json({ 
      error: e.message || String(e),
      identifier: process.env.TEST_IDENTIFIER 
    }, { status: 500 });
  }
}
