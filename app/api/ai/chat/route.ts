import { 
    CoreMessage, 
    streamText, 
    generateText, 
    tool 
} from 'ai'; 
import { openai } from '@ai-sdk/openai'; 
import { NextRequest, NextResponse } from 'next/server'; 
import { PrismaClient } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { z } from 'zod'; 
import { getContextForTask } from '@/lib/ai/contextHelper'; 
import { TASK_FIELD_CONFIG } from '@/config/TASK_FIELD_CONFIG'; 
import { getModelConfig, MODEL_IDS, ModelIdentifier } from '@/config/aiConfig'; 
import { createUpdateTaskSchema } from '@/lib/ai/dynamicToolSchema';
import { executeUpdateTaskFields, UpdateTaskParams } from '@/lib/ai/tools/updateTaskFields';

const prisma = new PrismaClient();

const maxDuration = 60;

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        console.error('[API Route Error] Generic Error:', error);
        return error.message || 'An unknown error occurred.';
    }
    console.error('[API Route Error] Unknown Error Type:', error);
    return 'An unknown error occurred.';
}

export async function POST(req: NextRequest): Promise<Response> {
    console.log('[API Route] Request received.');
    try {
        // --- Log Raw Body ---
        const rawBody = await req.text();
        console.log('[API Route] Raw Request Body:', rawBody);
        // --- End Log Raw Body ---
        let body;
        try {
            body = JSON.parse(rawBody); // Parse the raw body we already read
        } catch (parseError) {
            console.error('[API Route] Failed to parse JSON body:', parseError);
            console.error('[API Route] Raw Body Content:', rawBody); // Log raw body if parse fails
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        console.log('[API Route] Parsed Request Body:', body); // Log parsed body after successful parsing

        // Define the schema *inside* the POST handler to ensure correct scope
        const requestBodySchema = z.object({
            messages: z.array(z.any()), // Keep messages flexible as per Vercel AI SDK standard
            modelId: z.string({ required_error: "modelId is required in body" }), // Add specific error message
            taskId: z.string({ required_error: "taskId is required in body" }),   // Add specific error message
            maxTokens: z.number().int().positive().optional(), // Add maxTokens validation
            providerOptions: z.object({
                temperature: z.number().optional(),
                reasoningEffort: z.enum(['low', 'medium', 'high']).optional(), // Expecting 'low', 'medium', 'high'
            }).optional(),
            // Add other fields expected by the useChat hook's body if necessary
        });

        // Validate against the schema defined above
        const validated = requestBodySchema.safeParse(body);

        if (!validated.success) {
            console.error('[API Route] Zod Validation Failed:', validated.error.format()); // Log formatted errors
            // Improved error message showing exact missing/invalid fields
            const errorDetails = validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            const errorMessage = `Invalid request body. Issues: ${errorDetails}`;
            console.error(`[API Route] Validation Error Details: ${errorMessage}`);
            return NextResponse.json({ error: errorMessage }, { status: 400 });
        }

        // Destructure from the validated data
        const { messages, modelId, taskId, providerOptions, maxTokens } = validated.data;

        // --- Backend Log 2: Log Extracted IDs --- 
        console.log(`[API Route] Extracted - Task ID: ${taskId}, Model ID: ${modelId}`);

        // Validate required fields
        if (!messages || !taskId || !modelId) {
            console.error('[API Route] Redundant Check Failed: Missing messages, taskId, or modelId AFTER Zod validation');
            return NextResponse.json(
                { error: 'Internal Server Error: Validation inconsistency.' }, 
                { status: 500 }
            );
        }

        // --- Backend Log 3: Log ID of the instance retrieved from config --- 
        console.log(`[API Route] Attempting to get config for modelId: ${modelId}`);
        // Fix Type Error: Cast modelId string to ModelIdentifier type expected by getModelConfig
        const modelConfig = getModelConfig(modelId as ModelIdentifier); // Lint ID: f2b6a060

        if (!modelConfig) {
            console.error(`[API Route] Configuration not found for model: ${modelId}`);
            return NextResponse.json({ error: `Model configuration not found for ID: ${modelId}` }, { status: 400 });
        }

        const model = modelConfig.modelInstance;

        // --- Backend Log 4: Log ID of the instance retrieved from config --- 
        console.log(`[API Route] Retrieved model instance from config with ID: ${model.modelId}`);

        // Prepare the system prompt with optional task context
        let systemMessageContent = `You are a helpful AI assistant integrated into a To-Do list application.
           Your goal is to assist users with managing the task currently in context.
           You can understand task details, answer questions about them, and update task fields when requested.
           
           **Tool Usage Rules:**
           1.  **Direct Updates:** When the user explicitly asks you to 'update', 'set', 'change', or 'actualize' one or more specific fields (e.g., "Set priority to High", "Update the due date to 2025-12-31"), you MUST use the 'updateTaskFields' tool to apply ONLY those specific changes immediately.
           2.  **Consolidated Updates (Update Button):** If the LAST user message is exactly "Based on our conversation, please update the task fields now using the 'updateTaskFields' tool.", this is a special command triggered by the 'Update Task' button. You MUST review the ENTIRE conversation history BEFORE this message, identify ALL requested field changes discussed, and then call the 'updateTaskFields' tool ONCE with ALL those changes consolidated together.
           3.  **Necessary Use Only:** Only use the 'updateTaskFields' tool when an update is clearly requested as per rules 1 or 2. Do not use it for just discussing the task.
           4.  **Field Names:** When using the tool, use the EXACT field names defined in the tool's schema (which matches the AVAILABLE TASK FIELDS list below).
           5.  **Date Format:** Always use ISO 8601 format for dates/datetimes (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ).
           6.  **Clearing Fields:** If a user asks to clear or remove a field's value, use 'null' as the value in the tool call.
           
           Be concise and clear in your responses.
           
           AVAILABLE TASK FIELDS for reference (use tool schema for actual updates):
           - name (text): Task title (User managed, AI reads only). Starts with verb.
           - description (textarea): AI writes final output/result here. Can overwrite.
           - notes (textarea): User's working notes. AI can read/append if asked.
           - task_comments (textarea): User & AI communication log (Append only).
           - portfolio, project, section (multi-select): Task location. Use exact options provided in context.
           - priority (dropdown): Importance. Options: [High, Medium, Low]. Use exact value.
           - status (dropdown): Current state. Options: [New, In Progress, Waiting, Deferred, Completed, Archived]. Use exact value.
           - due_date (date): Deadline. Format: YYYY-MM-DD or ISO string. null to clear.
           - tags (tags): Keywords. Use exact options provided in context.
           - estimated_duration_minutes (number): Time estimate.
           - actual_duration_minutes (number): Time spent (User logs this).
           - assignee (text): Person responsible (Usually user). 
           - ai_brief (textarea): User instructions for AI. AI reads carefully.
           - desired_output_format (textarea): User specifies desired AI output format. AI reads carefully.
           - ai_workflow_status (dropdown): AI's progress state. Options: [Pending, In Progress, Needs Review, Completed, Error]. AI updates this.
           - ai_agent_notes (textarea): AI's internal notes/logs/questions during execution (Append only).
           - ai_quality_rating (dropdown): User rates AI work (User sets). AI reads for context.
           - feedback_for_ai (textarea): User feedback for AI (User sets). AI reads for context.
           - suggested_initial_steps_subtasks, related_areas_for_ai_to_consider, potential_dependencies_related_tasks (textarea): User input fields providing context for AI.
           - internet_requirement, focus_requirement (dropdown): Conditions for user work.
           - optimal_time_of_day (multi-select): Best time for user.
           - related_portfolios, related_projects, related_sections (multi-select): Related areas.
           - related_entities (multi-select): Related people/organizations (array of strings). Use this exact field name.
           - target_audience, task_purpose, expected_impact_success_metric (textarea): Context fields.
           - waiting_for (text): What blocks the task.
           Current date: ${new Date().toISOString()}`;

        if (taskId) {
            try {
                const taskContextString = await getContextForTask(taskId);
                systemMessageContent += `\n\n## Current Task Context\n${taskContextString}`;
                console.log(`Injecting context for task ID: ${taskId}`);
            } catch (error) {
                console.error(`Failed to get context for task ${taskId}:`, error);
            }
        }

        const systemMessage: CoreMessage = { role: 'system', content: systemMessageContent };
        const userAndAssistantMessages = messages.filter((m: CoreMessage) => m.role !== 'system');
        const finalMessages: CoreMessage[] = [systemMessage, ...userAndAssistantMessages];

        // Define the update task tool dynamically using the Zod schema
        const updateTaskSchema = createUpdateTaskSchema(modelId); // Pass modelId, rename back

        // Define the update task tool using the Zod schema directly
        const updateTaskTool = tool({
            description: 'Update one or more fields of the specified task. Use this tool when asked to change, set, or update task details.',
            parameters: updateTaskSchema, // Pass the Zod schema directly
            execute: async (params) => {
                console.log('AI attempting to call updateTaskFields with RAW params:', JSON.stringify(params, null, 2));
                try {
                    // Cast needed as the execute function expects a concrete type,
                    // while params might be inferred more broadly by TS initially.
                    const result = await executeUpdateTaskFields(params as UpdateTaskParams);
                    console.log('Result from executeUpdateTaskFields:', result);
                    if (result.success) {
                        console.log('Tool execution successful:', result.message);
                        return { success: true, message: result.message, data: result.data };
                    } else {
                        console.error('Tool execution failed:', result.message, 'Error:', result.error);
                        return { success: false, message: result.message, error: result.error ?? 'Unknown execution error' };
                    }
                } catch (executionError) {
                     console.error('Critical error during tool execution:', executionError);
                     return { success: false, message: `Tool execution failed: ${getErrorMessage(executionError)}`, error: getErrorMessage(executionError) };
                }
            },
        });

        console.log('--- Preparing AI Request ---');
        console.log(`Model ID: ${modelId}`);
        console.log(`Temperature from options: ${providerOptions?.temperature ?? '(default)'}`);
        console.log(`Reasoning Effort from options: ${providerOptions?.reasoningEffort ?? '(default)'}`);
        console.log('System Prompt:', systemMessageContent);
        console.log('Messages:', JSON.stringify(finalMessages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '') : '[non-string content]' })), null, 2));
        console.log('---------------------------');

        // --- Log Parameters Passed to streamText --- 
        const streamTextParamsLog = {
            model: model.modelId, // Log the actual model ID being used
            system: systemMessageContent,
            messages: finalMessages.map(m => ({ 
                role: m.role, 
                content: typeof m.content === 'string' ? m.content.substring(0, 200) + (m.content.length > 200 ? '...' : '') : '[non-string content]',
                toolInvocations: (m as any).toolInvocations // Include tool invocations if present
            })),
            temperature: providerOptions?.temperature,
            maxTokens: maxTokens, // Log maxTokens
            tools: { updateTaskFields: 'exists' }, // Indicate tool presence
            toolChoice: 'auto', // Allow the AI to decide whether to use the tool
            ...(modelConfig.supportsReasoningEffort && providerOptions?.reasoningEffort && {
                providerOptions: { openai: { reasoningEffort: providerOptions.reasoningEffort } }
            })
        };
        console.log('[API Route] Parameters being passed to streamText:', JSON.stringify(streamTextParamsLog, null, 2));
        // --- End Log Parameters --- 

        // Call the AI model using the Vercel AI SDK streamText function
        const result = await streamText({
            model: model, // Use the retrieved model instance (derived directly from frontend's modelId)
            system: systemMessageContent, 
            messages: finalMessages, 
            temperature: providerOptions?.temperature, // Use temperature from options
            maxTokens: maxTokens, // Pass validated maxTokens
            tools: { updateTaskFields: updateTaskTool }, // Pass the correctly defined tool
            toolChoice: 'auto', // Allow the AI to decide whether to use the tool
            // If the model supports reasoningEffort and it's provided, pass it via providerOptions
            // (Assuming OpenAI provider for models supporting this based on current config)
            ...(modelConfig.supportsReasoningEffort && providerOptions?.reasoningEffort && {
                providerOptions: { openai: { reasoningEffort: providerOptions.reasoningEffort } } 
            })
        });

        console.log('[API Route] Tool execution completed (if any), preparing stream response...'); // Added log

        console.log('[API Route] Attempting to return stream response...');
        return result.toDataStreamResponse({ getErrorMessage });

    } catch (error) {
        console.error("[API Route] Error:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : 'No stack available';
        // Return a detailed JSON error response
        return NextResponse.json({ 
            error: 'An unexpected error occurred in POST handler.', 
            details: errorMessage, 
            stack: errorStack // Include stack trace for debugging
        }, { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
