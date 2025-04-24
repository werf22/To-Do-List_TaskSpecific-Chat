// app/api/ai/global-chat/route.ts
import { CoreMessage, streamText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Or your preferred provider
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Simple validation for incoming messages
const requestBodySchema = z.object({
  messages: z.array(z.any()), // Keep messages flexible
  // Add any other global options you might need (e.g., model choice)
});

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const validated = requestBodySchema.safeParse(await req.json());

    if (!validated.success) {
      const errorDetails = validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return NextResponse.json({ error: `Invalid request body. Issues: ${errorDetails}` }, { status: 400 });
    }

    const { messages } = validated.data;

    // Basic system prompt for global chat
    const systemMessageContent = `You are a helpful general assistant for the To-Do List application. 
    You can answer general questions about the app or provide helpful information. 
    You do not have access to specific task details in this chat. Current date: ${new Date().toISOString()}`;

    const systemMessage: CoreMessage = { role: 'system', content: systemMessageContent };
    const finalMessages: CoreMessage[] = [systemMessage, ...messages];

    // --- Simple streamText call --- 
    const result = await streamText({
      model: openai('gpt-4o-mini'), // Default model for global chat
      messages: finalMessages,
      // No task-specific tools needed here for now
    });

    // Return the streaming response
    return result.toDataStreamResponse();

  } catch (error: unknown) {
    console.error('[API Global Chat Error]:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
