import OpenAI from 'openai';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionCallingMode } from '@google/generative-ai';
import { Task } from '@prisma/client';
import { AI_MODELS, MODEL_IDS, AiProvider, ChatMessage, TaskUpdatePayload } from '@/config/aiConfig'; // Added MODEL_IDS
import { UPDATE_TASK_FUNCTION_NAME, updateTaskFieldsTool } from '@/lib/ai/dynamicToolSchema'; // Correct import
import zodToJsonSchema from 'zod-to-json-schema'; // Import the converter

// Initialize Clients (using environment variables)
let openaiClient: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('OPENAI_API_KEY not found in environment variables. OpenAI functionality will be disabled.');
}

let genAIClient: GoogleGenerativeAI | null = null;
if (process.env.GEMINI_API_KEY) {
  genAIClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
  console.warn('GEMINI_API_KEY not found in environment variables. Gemini functionality will be disabled.');
}

// --- Helper to build the system prompt --- //
const buildSystemPrompt = (taskSchema: any): string => {
  return `You are an AI assistant managing details for a specific task.
User interactions will be about the task whose current data is provided below.
Available fields and their types/options:
${JSON.stringify(taskSchema, null, 2)}

Your goal is to:
1. Answer questions about the task using the provided data.
2. Modify task fields when requested by the user.
3. IMPORTANT: To modify fields, you MUST use the '${UPDATE_TASK_FUNCTION_NAME}' function call.
4. Respond concisely in natural language for questions or confirmations.
5. If the user request is ambiguous, ask for clarification.
6. Adhere strictly to the available fields and value types/options defined in the schema. Do not invent fields or values.
7. Ensure that updates to relational fields like 'Dependents', 'Outgoing Dependents', and 'Related Tasks' follow the project's rules for bidirectional linking (this validation happens server-side, but be aware of the requirement).
`;
};

// --- Main Function to Interact with AI --- //

interface AIResponse {
  text?: string;
  functionCall?: {
    name: string;
    arguments: TaskUpdatePayload;
  };
  error?: string;
}

export const getAiChatResponse = async (
  task: Task,
  history: ChatMessage[],
  userMessage: string,
  provider: AiProvider = (process.env.DEFAULT_AI_PROVIDER as AiProvider) || 'openai' // Default or from env
): Promise<AIResponse> => {

  // Get the Zod schema from the imported tool
  const zodSchema = updateTaskFieldsTool.parameters;
  // Convert Zod schema to JSON schema for the APIs
  const taskSchemaJson = zodToJsonSchema(zodSchema, UPDATE_TASK_FUNCTION_NAME);

  // Build system prompt using the JSON schema description (may need refinement)
  const systemPrompt = buildSystemPrompt(taskSchemaJson);

  // Combine history and current data into messages
  const messages: ChatMessage[] = [
    { role: 'assistant', content: systemPrompt }, // Use 'assistant' for system-like prompt here
    { role: 'assistant', content: `Current Task Data:\n${JSON.stringify(task, null, 2)}` },
    ...history,
    { role: 'user', content: userMessage },
  ];

  try {
    if (provider === 'openai' && openaiClient) {
      // Pass components needed to build the OpenAI tool definition
      return callOpenAI(messages, UPDATE_TASK_FUNCTION_NAME, updateTaskFieldsTool.description ?? '', taskSchemaJson);
    } else if (provider === 'gemini' && genAIClient) {
      // Pass components needed to build the Gemini tool definition
      return callGemini(messages, UPDATE_TASK_FUNCTION_NAME, updateTaskFieldsTool.description ?? '', taskSchemaJson);
    } else {
      return { error: `AI provider '${provider}' is not configured or API key is missing.` };
    }
  } catch (error: any) {
    console.error(`Error calling AI provider ${provider}:`, error);
    return { error: `Failed to get response from ${provider}: ${error.message}` };
  }
};

// --- OpenAI Specific Call --- //
const callOpenAI = async (messages: ChatMessage[], funcName: string, funcDesc: string, paramsSchema: any): Promise<AIResponse> => {
  if (!openaiClient) return { error: 'OpenAI client not initialized.' };

  const openAiMessages = messages.map(msg => ({ role: msg.role, content: msg.content }));

  try {
    const response = await openaiClient.chat.completions.create({
      model: MODEL_IDS.GPT41, // Use a valid model ID
      messages: openAiMessages,
      tools: [{ type: 'function', function: { name: funcName, description: funcDesc, parameters: paramsSchema } }],
      tool_choice: 'auto', // Let OpenAI decide whether to call the function
      // Applying requested settings - check SDK documentation for exact mapping if needed
      // temperature: 0.7, // Example: Adjust temperature as needed
      // 'reasoning_effort': 'high', // Note: Check if this exact param exists or has an equivalent
      // 'store': false, // Note: Check if this exact param exists or has an equivalent
    });

    const responseChoice = response.choices[0];
    const message = responseChoice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0]; // Assuming one function call for now
      if (toolCall.function.name === UPDATE_TASK_FUNCTION_NAME) {
        try {
          const args = JSON.parse(toolCall.function.arguments) as TaskUpdatePayload;
          return { functionCall: { name: UPDATE_TASK_FUNCTION_NAME, arguments: args } };
        } catch (parseError) {
          console.error('Failed to parse function call arguments:', parseError);
          return { error: 'AI returned invalid function call format.' };
        }
      }
    }

    return { text: message.content ?? undefined };

  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    // Handle specific OpenAI errors if necessary (e.g., rate limits, auth)
    return { error: `OpenAI API request failed: ${error.message}` };
  }
};

// --- Gemini Specific Call --- //
const callGemini = async (messages: ChatMessage[], funcName: string, funcDesc: string, paramsSchema: any): Promise<AIResponse> => {
  if (!genAIClient) return { error: 'Gemini client not initialized.' };

  // Convert messages to Gemini format
  const geminiContents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user', // Gemini uses 'model' for assistant
    parts: [{ text: msg.content }],
  }));

  // Safety settings (adjust as needed)
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ];

  try {
    const model = genAIClient.getGenerativeModel({
      model: MODEL_IDS.GPT41, // Placeholder: Use a valid ID, Gemini model not defined in config
      safetySettings,
      generationConfig: {
        // temperature: 0.9, // Example
        responseMimeType: 'application/json', // Request JSON for function calling
      },
      tools: [{ functionDeclarations: [{ name: funcName, description: funcDesc, parameters: paramsSchema }] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.AUTO, // Use enum member instead of string
        },
      },
    });

    const chat = model.startChat({ history: geminiContents.slice(0, -1) }); // Start chat with history
    const lastMessage = geminiContents[geminiContents.length - 1].parts[0].text;

    const result = await chat.sendMessage(lastMessage);
    const response = result.response;
    const responseText = response.text(); // Get text response if available
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const fnCall = functionCalls[0]; // Assuming one
      if (fnCall.name === UPDATE_TASK_FUNCTION_NAME) {
         // Gemini provides args directly as an object
        return { functionCall: { name: UPDATE_TASK_FUNCTION_NAME, arguments: fnCall.args as TaskUpdatePayload } };
      }
    }

    // Gemini might return text even with function calling attempts, prioritize function call
    if (responseText) {
       return { text: responseText };
    }

    // If no text and no valid function call, return empty or an indicator
    return { text: '' }; // Or handle as needed

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return { error: `Gemini API request failed: ${error.message}` };
  }
};

console.log('aiUtils loaded');
