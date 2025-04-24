import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { 
  executeUpdateTaskFields, 
  type UpdateTaskParams 
} from '@/lib/ai/tools/updateTaskFields'; 
import { 
  updateTaskFieldsTool, 
  UPDATE_TASK_FUNCTION_NAME 
} from '@/lib/ai/dynamicToolSchema'; 
import { type Message } from 'ai/react'; // Import Message type if needed elsewhere, or use CoreMessage
import { type CoreMessage } from 'ai'; // CoreMessage is often used server-side

// --- Request Body Validation --- // TODO: Add modelName validation later
const executeToolRequestSchema = z.object({
  messages: z.array(z.any()), // Use z.any() for now, refine if CoreMessage structure is strict
  taskId: z.string().uuid(),
  // modelName: z.string(), // Add model validation if needed
});

// --- POST Handler --- 
export async function POST(req: Request) {
  console.log('Received request for /api/ai/execute-tool');
  try {
    const rawBody = await req.json();
    
    // Validate request body
    const validationResult = executeToolRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error('Invalid request body:', validationResult.error.flatten());
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() }, 
        { status: 400 }
      );
    }

    const { messages: incomingMessages, taskId } = validationResult.data;
    const modelName = 'o4-mini'; // Hardcoded for now, as this route is specific to it

    console.log(`Executing tool for Task ID: ${taskId} with model: ${modelName}`);

    // --- Fetch Task Details (Optional but recommended for context) ---
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    // TODO: Verify exact field names against prisma.schema
    const taskContext = `\n\nCurrent Task Details (ID: ${taskId}):\nName: ${task.name}\nDescription: ${task.description || 'N/A'}`;
    // \nStatus: ${task.status} // Lint error: Property 'status' does not exist
    // \nPriority: ${task.priority || 'N/A'} // Lint error: Property 'priority' does not exist
    // \nDue Date: ${task.dueDate?.toISOString() || 'N/A'} // Lint error: Property 'dueDate' does not exist (maybe 'due_date'?)
    // \n(Add other relevant fields from schema)`;

    // --- Prepare Messages for AI --- 
    // Ensure messages are in the CoreMessage format expected by generateText
    // You might need to adapt the structure from incomingMessages (e.g., from 'ai/react' Message)
    const messages: CoreMessage[] = [
      // Example: Add a system prompt if desired
      { role: 'system', content: `You are an AI assistant helping manage a To-Do list. You can update task details using the available tools. Current task context is provided below. ${taskContext}` }, 
      // Map incoming messages (adjust role/content keys if needed)
      ...incomingMessages.map((msg: any) => ({ 
        role: msg.role, // Assuming 'role' exists 
        content: msg.content // Assuming 'content' exists
        // Add tool_calls / tool_call_id if present and needed
      })),
      // Add the final user prompt implicitly asking for the tool use
      { role: 'user', content: `Based on our conversation, please update the task fields now using the '${UPDATE_TASK_FUNCTION_NAME}' tool for Task ID ${taskId}.`}
    ];

    // --- Call AI Model (Non-Streaming) ---
    console.log('Calling generateText with o4-mini...');
    const result = await generateText({
      model: openai(modelName),
      messages: messages,
      tools: { 
        [UPDATE_TASK_FUNCTION_NAME]: updateTaskFieldsTool
      },
      // You might configure temperature, max tokens etc. if needed for o4-mini
    });

    console.log('AI Response received:', JSON.stringify(result, null, 2));

    // --- Process Tool Calls --- 
    if (result.toolCalls && result.toolCalls.length > 0) {
      // Currently expecting only one tool call for this specific flow
      const toolCall = result.toolCalls[0]; 
      
      if (toolCall.toolName === UPDATE_TASK_FUNCTION_NAME) {
        console.log(`AI requested tool: ${toolCall.toolName} with args:`, toolCall.args);
        try {
          // Validate args (already done by 'ai' SDK if schema is correct, but extra check can be good)
          // const validatedArgs = updateTaskFieldsSchema.parse(toolCall.args);
          const validatedArgs = toolCall.args as UpdateTaskParams; // Assuming SDK handles validation

          // Execute the actual database update
          const updatedTaskResult = await executeUpdateTaskFields(validatedArgs);

          console.log('Tool execution successful.');
          // Return a message indicating success and perhaps the updated task data
          return NextResponse.json({
            status: 'tool_executed',
            toolName: toolCall.toolName,
            toolArgs: validatedArgs,
            // Include a message for the chat interface
            chatResponse: `Okay, I have updated the task (ID: ${taskId}) with the following details: ${JSON.stringify(validatedArgs)}`,
            updatedTask: updatedTaskResult // Optionally return the full updated task
          });

        } catch (error: any) {
          console.error('Error executing tool or validating arguments:', error);
          // Return an error message suitable for the chat interface
          return NextResponse.json({ 
            status: 'tool_error',
            toolName: toolCall.toolName,
            error: 'Failed to execute task update.',
            details: error.message, // Provide specific error details if safe
            chatResponse: `Sorry, I encountered an error trying to update the task: ${error.message}`
          }, { status: 500 });
        }
      } else {
         console.warn(`AI requested an unexpected tool: ${toolCall.toolName}`);
         // Handle unexpected tool calls if necessary
         return NextResponse.json({ 
            status: 'unexpected_tool',
            chatResponse: `I received a request for an unexpected tool (${toolCall.toolName}) and couldn't proceed.`
         }, { status: 400 });
      }
    } else {
      // --- Handle No Tool Call (AI just responded with text) ---
      console.log('AI did not request a tool, returned text:', result.text);
      return NextResponse.json({
        status: 'text_response',
        chatResponse: result.text || 'The AI did not provide a specific update action.',
      });
    }

  } catch (error: any) {
    console.error('Error in /api/ai/execute-tool:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message }, 
      { status: 500 }
    );
  }
}
