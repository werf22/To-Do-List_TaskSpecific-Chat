import { z } from 'zod';
import { TASK_FIELD_CONFIG, TaskFieldConfig } from '@/config/TASK_FIELD_CONFIG';
import { tool } from 'ai'; // Import the 'tool' function

/**
 * The name of the function the AI will call to update task fields.
 */
export const UPDATE_TASK_FUNCTION_NAME = 'updateTaskFields';

/**
 * Dynamically creates a Zod schema for updating task fields based on TASK_FIELD_CONFIG.
 * Ensures that only fields defined in the config are included and applies appropriate Zod types.
 * Makes fields optional to allow partial updates, minimizing token usage.
 * Conditionally simplifies the schema for 'tags' field for 'o4-mini' model.
 * Allows null for clearing specific fields like dates.
 *
 * @param {string} modelId - The ID of the AI model being used (e.g., 'o4-mini', 'gpt-4.1').
 * @returns {z.ZodObject<any>} A Zod object schema for task update parameters.
 */
export const createUpdateTaskSchema = (modelId: string): z.ZodObject<any> => {
	const shape: Record<string, z.ZodTypeAny> = {
		task_id: z
			.string()
			.describe(
				'The unique identifier of the task to update. THIS IS ALWAYS REQUIRED.',
			),
	};

    // Correctly iterate over the TASK_FIELD_CONFIG object using Object.entries
	Object.entries(TASK_FIELD_CONFIG).forEach(([fieldId, config]: [string, TaskFieldConfig]) => {
		// Skip fields that should not be directly updatable by AI via this tool
		if (
			[
				'task_id',          // Handled explicitly above
                'name',             // AI should not rename tasks via this tool
                'description',      // This is AI output, not input
                'notes',            // This is AI working space, not direct input
                'task_comments',    // Handled via chat interface
                'created_at',       // System managed
                'last_modified_at', // System managed
                'completed_at',     // System managed (use 'status' instead?)
                'assignee',         // Complex object/relation, handle separately if needed
                'related_tasks_id', // Complex relation, handle separately if needed
                'ai_agent_status_log', // System managed
                'ai_output_result_link', // System managed
			].includes(fieldId) // Use fieldId (the key) for the check
		) {
			return;
		}

		let zodType: z.ZodTypeAny;
        let isNullable = false;
        const isO4Mini = modelId === 'o4-mini';

		switch (config.type) { // Access type via config.type
			case 'text':
			case 'textarea':
			case 'url':
			case 'email':
			case 'phone':
				zodType = z.string().describe(config.description || config.label); // Use config.label as fallback
                // Maybe allow null for text? Let's keep it simple for now.
				break;
			case 'number':
			case 'currency':
				zodType = z.number().describe(config.description || config.label); // Use config.label
                // isNullable = true; // Optional: allow null to clear numbers
				break;
			case 'date': // Handle 'date' and potentially 'datetime' if needed
            case 'datetime':
				zodType = z
					.string()
					.describe(config.description || config.label); // Use config.label
				isNullable = true; // Mark date as potentially nullable
				break;
			case 'checkbox':
				zodType = z.boolean().describe(config.description || config.label); // Use config.label
                // Booleans typically aren't nullable in forms, false means unchecked.
				break;
			case 'dropdown':
				if (config.options && config.options.length > 0) {
                    // Add explicit type for opt
					const enumOptions = config.options.map((opt: string | number | boolean) => // Access options via config.options
						String(opt),
					) as [string, ...string[]];

					// Simplify schema for o4-mini if too many options
					if (isO4Mini && enumOptions.length > 50) {
						zodType = z.string().describe(
							`${config.description || config.label} (Provide one of the following values: ${enumOptions.slice(0, 50).join(', ')}${enumOptions.length > 50 ? '...' : ''})`,
						);
					} else if (enumOptions.length > 0) {
						zodType = z
							.enum(enumOptions)
							.describe(config.description || config.label); // Use config.label
                            // isNullable = true; // Optional: allow null to clear dropdown selection
					} else {
						zodType = z.string().describe(
							`${config.description || config.label} (Dropdown - No options defined)`,
						);
					}
				} else {
					zodType = z.string().describe(
						`${config.description || config.label} (Dropdown - Options missing)`,
					);
				}
				break;
			case 'multi-select':
            case 'tags': // Treat 'tags' similarly to multi-select based on previous logic
				if (config.options && config.options.length > 0) {
                    // Add explicit type for opt
					const enumOptions = config.options.map((opt: string | number | boolean) => // Access via config.options
						String(opt),
					) as [string, ...string[]];

					// Simplify schema for o4-mini if too many options
					if (isO4Mini && enumOptions.length > 50) {
						zodType = z.array(z.string()).describe(
							`${config.description || config.label} (Provide an array containing zero or more of the following values: ${enumOptions.slice(0, 50).join(', ')}${enumOptions.length > 50 ? '...' : ''})`,
						);
					} else if (enumOptions.length > 0) {
						// For other models or other multi-select fields, use the strict enum array
						zodType = z
							.array(z.enum(enumOptions))
							.describe(config.description || config.label); // Use config.label
					} else {
                        // Fallback if options are empty
						zodType = z.array(z.string()).describe(
							`${config.description || config.label} (Multi-select - No options defined)`,
						);
					}
				} else {
                    // Fallback if options missing entirely
					zodType = z.array(z.string()).describe(
						`${config.description || config.label} (Multi-select - Options missing)`,
					);
				}
                // Nullable array doesn't make much sense, empty array `[]` means no selection.
				break;
            // Add cases for other types if they need specific handling and are updatable
            case 'rating':
                zodType = z.number().int().min(0).max(5).describe(config.description || config.label);
                // isNullable = true; // Allow null to clear rating?
                break;
            case 'progress':
                zodType = z.number().min(0).max(100).describe(config.description || config.label);
                // isNullable = true; // Allow null to clear progress?
                break;
			default:
                // Log unhandled types but don't add them to the schema for AI updates
                // console.warn(`Unhandled or non-updatable field type in dynamicToolSchema: ${fieldId} (${config.type})`);
                // Use return to skip to the next item in forEach, instead of continue
                return;
		}

		// Conditionally apply .optional() and .nullable() based on modelId
        let finalType: z.ZodTypeAny;

        if (isO4Mini) {
            // For o4-mini, schema requires fields to be non-optional and non-nullable.
            // We will handle potential clearing intent (e.g., empty string) later in the execution logic.
            finalType = zodType; // Always use the base type, strictly required.
        } else {
            // For other models (e.g., gpt-4.1), allow partial updates by making fields optional.
            if (isNullable) {
                // Nullable AND optional
                finalType = zodType.nullable().optional();
            } else {
                // Optional only
                finalType = zodType.optional();
            }
        }

		shape[fieldId] = finalType; // Assign using fieldId as the key
	});

	return z.object(shape);
};

/**
 * Defines the AI tool for updating task fields using a dynamically generated schema.
 */
export const updateTaskFieldsTool = tool({
  description: 'Update one or more fields of a specific task. Use this tool when the user asks to change, modify, set, or update any property of the current task.',
  parameters: createUpdateTaskSchema('o4-mini'), // Pass 'o4-mini' as the modelId
  // execute: async (args) => { ... } // Execute logic is handled in the API route
});
