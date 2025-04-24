import { z } from 'zod';
import { TASK_FIELD_CONFIG, type TaskFieldConfig } from '@/config/TASK_FIELD_CONFIG';
import { tool } from 'ai'; // Import the 'tool' function

/**
 * The name of the function the AI will call to update task fields.
 */
export const UPDATE_TASK_FUNCTION_NAME = 'updateTaskFields';

/**
 * Maps a field type string to a Zod schema type.
 * Handles basic types, arrays, dates, and specific known dropdowns.
 * NOTE: This function now returns the base Zod type without .optional(),
 * as the SDK seems to require all properties listed in the 'required' array.
 */
function mapFieldTypeToZod(fieldConfig: TaskFieldConfig): z.ZodTypeAny {
    // Use fieldConfig.type based on the TaskFieldConfig definition
    switch (fieldConfig.type) {
        case 'text':
        case 'textarea':
        // case 'ID': // ID type is not defined in the union, handled by fieldId check later
        case 'url':
        case 'email':
        case 'phone':
        case 'dropdown':
        // case 'ASSIGNEE': // Not defined type
        // case 'STATUS': // Not defined type
        // case 'PRIORITY': // Not defined type
        case 'ai_generated':
            return z.string().describe(fieldConfig.description || `Value for ${fieldConfig.label}`);
        case 'number':
        case 'currency':
        case 'rating':
        case 'progress': // progress type exists
            return z.number().describe(fieldConfig.description || `Value for ${fieldConfig.label}`); // Use general number for int/float/currency/rating/progress
        // case 'FLOAT': // FLOAT type is not defined
        // case 'INTEGER': // INTEGER is not defined, but handle as number
        case 'checkbox': // CHECKBOX type exists
            return z.boolean().describe(fieldConfig.description || `Value for ${fieldConfig.label}`);
        case 'date':
            // Return string to avoid 'format' in JSON schema. Add description for guidance.
            return z.string().describe(fieldConfig.description ? `${fieldConfig.description} (Provide as ISO 8601 string: YYYY-MM-DD)` : 'Date (Provide as ISO 8601 string: YYYY-MM-DD)');
        case 'datetime':
            // Return string to avoid 'format' in JSON schema. Add description for guidance.
            return z.string().describe(fieldConfig.description ? `${fieldConfig.description} (Provide as ISO 8601 string: YYYY-MM-DDTHH:mm:ssZ)` : 'DateTime (Provide as ISO 8601 string: YYYY-MM-DDTHH:mm:ssZ)');
        case 'multi-select':
        case 'tags':
        // case 'COLLABORATORS': // Not defined type
        // case 'PEOPLE': // Not defined type
            return z.array(z.string()).describe(fieldConfig.description || `Value for ${fieldConfig.label}`);
        // Handle types defined but not explicitly mapped yet or not suitable for AI update
        case 'readonly':
        case 'divider':
        case 'file':
        case 'subtasks':
            // Returning z.any() here ensures it's part of the properties if needed by some logic,
            // but the main createUpdateTaskSchema function filters these out anyway.
            // For robustness, describe it as not intended for AI updates.
            return z.any().describe('This field type is not intended for direct AI updates.');
        default:
            // Log unhandled types defined in the union if necessary
            console.warn(`Unhandled field type in mapFieldTypeToZod: ${fieldConfig.type}. Defaulting to z.any().`);
            return z.any().describe(fieldConfig.description || `Unhandled type: ${fieldConfig.type}`);
    }
}

/**
 * Dynamically creates a Zod schema for the updateTaskFields tool parameters
 * based on the provided TASK_FIELD_CONFIG.
 * NOTE: All editable fields are included and marked as required in the resulting
 * JSON schema's 'required' array to comply with Vercel AI SDK/model expectations.
 * The actual update logic in the API route handles partial updates.
 *
 * @returns A Zod object schema representing the tool parameters.
 */
export function createUpdateTaskSchema(): z.ZodObject<any, any> {
    const shape: Record<string, z.ZodTypeAny> = {
        // Task ID is always required for updates.
        task_id: z.string().describe('The unique identifier of the task to update. THIS IS ALWAYS REQUIRED.'),
    };

    Object.entries(TASK_FIELD_CONFIG).forEach(([fieldId, fieldConfig]) => {
        // Check using fieldId and fieldConfig.editable
        // Skip non-editable fields or fields AI shouldn't modify based on name convention or type
        if (!fieldConfig.editable ||
            fieldId === 'task_id' || // Already handled
            fieldId === 'id' || // Internal ID
            fieldId === 'created_at' || // Auto-managed
            fieldId === 'last_modified_at' || // Auto-managed
            fieldId === 'completed_at' || // Often managed by specific actions
            fieldConfig.type === 'readonly' || // Not editable
            fieldConfig.type === 'divider' || // Not data
            fieldConfig.type === 'file' || // Complex type, handle differently
            fieldConfig.type === 'subtasks' // Complex type, handle differently
        ) {
            return; // Skip this field
        }

        // Get the base Zod type
        let zodType = mapFieldTypeToZod(fieldConfig);

        // Add description if not already added by mapFieldTypeToZod or if it's generic
        if (fieldConfig.description && !zodType.description) {
             zodType = zodType.describe(fieldConfig.description);
        } else if (!zodType.description) {
            // Add a fallback description if none exists
            zodType = zodType.describe(`Value for ${fieldConfig.label || fieldId}`);
        }

        // Add the field to the shape - NO .optional() here
        shape[fieldId] = zodType;
    });

    // Create the Zod object schema from the shape
    const schema = z.object(shape);

    // console.log('Generated Zod Schema for updateTaskFields:', schema.shape);
    // console.log('Generated JSON Schema:', JSON.stringify(schema.openapi('updateTaskFields'), null, 2));


    return schema;
}

/**
 * Defines the AI tool for updating task fields using a dynamically generated schema.
 */
export const updateTaskFieldsTool = tool({
  description: 'Update one or more fields of a specific task. Use this tool when the user asks to change, modify, set, or update any property of the current task.',
  parameters: createUpdateTaskSchema(),
  // execute: async (args) => { ... } // Execute logic is handled in the API route
});
