import { Task } from '@prisma/client';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV1 } from 'ai';

// Create the standard OpenAI provider instance
// It will automatically use the OPENAI_API_KEY environment variable
const openai = createOpenAI({
  compatibility: 'strict', // Use strict mode for OpenAI API
});

// --- Model Definitions ---

// Define Model IDs using the exact names required
export const MODEL_IDS = {
  GPT41: 'gpt-4.1',
  O4_MINI: 'o4-mini',
  // Add other model IDs here if needed
} as const; // Use const assertion for strict typing

type ModelId = typeof MODEL_IDS[keyof typeof MODEL_IDS];

// Define the type for the actual model identifier strings
export type ModelIdentifier = typeof MODEL_IDS[keyof typeof MODEL_IDS]; // 'gpt-4.1' | 'o4-mini'

// Map Model IDs (keys like GPT41) to their initialized LanguageModelV1 instances
// Use a type assertion to help TypeScript understand the structure
// --- Model Instances (Internal Use) --- 
const AI_MODELS: Record<ModelIdentifier, LanguageModelV1> = {
  [MODEL_IDS.GPT41]: openai(MODEL_IDS.GPT41), // Use standard OpenAI provider for gpt-4.1
  [MODEL_IDS.O4_MINI]: openai(MODEL_IDS.O4_MINI), // Use standard OpenAI provider for o4-mini
  // Add other model instances here, associating them with the correct provider
};

// --- Model Configuration (Public Use) --- 

export type ReasoningEffortValue = 'low' | 'medium' | 'high';

export interface ModelConfig {
  id: ModelIdentifier;
  displayName: string;
  modelInstance: LanguageModelV1; // Reference to the initialized model
  maxTokensLimit: number; // Maximum allowed output tokens
  supportsTemperature: boolean;
  supportsReasoningEffort: boolean;
}

export const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: MODEL_IDS.GPT41,
    displayName: MODEL_IDS.GPT41, // Use exact ID
    modelInstance: AI_MODELS[MODEL_IDS.GPT41],
    maxTokensLimit: 32768, // Example practical limit, adjust based on API/needs
    supportsTemperature: true,
    supportsReasoningEffort: false,
  },
  {
    id: MODEL_IDS.O4_MINI,
    displayName: MODEL_IDS.O4_MINI, // Use exact ID
    modelInstance: AI_MODELS[MODEL_IDS.O4_MINI],
    maxTokensLimit: 8192, // Assuming this limit for o4-mini
    supportsTemperature: false,
    supportsReasoningEffort: true,
  }
  // Add configurations for other models here
];

// Helper to get config by ID
export function getModelConfig(id: ModelIdentifier): ModelConfig | undefined {
  return MODEL_CONFIGS.find(config => config.id === id);
}

// Define supported AI providers
export type AiProvider = 'openai' | 'gemini';

// Define the structure for a chat message
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  // Add function call info if needed later
  // function_call?: { name: string; arguments: string };
}

// Interface for the function call arguments
// This will be dynamically generated based on task fields, but good to have a base type
export type TaskUpdatePayload = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>;

export {};
