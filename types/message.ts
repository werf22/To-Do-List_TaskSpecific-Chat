// /Users/test/Desktop/ToDoList_NEW/types/message.ts
export interface Message {
  id: string;
  content: string | null; // Allow null for tool responses, ensure backend handles this
  role: 'user' | 'assistant' | 'system' | 'tool';
  // Optional fields based on OpenAI's tool usage format
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string; // Arguments are a JSON string
    };
  }>;
  tool_call_id?: string; // ID for the tool message response
}
