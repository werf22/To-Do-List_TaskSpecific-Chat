import prisma from '@/lib/prisma';
import { Task } from '@prisma/client';
import { TASK_FIELD_CONFIG, TaskFieldConfig } from '@/config/TASK_FIELD_CONFIG';

// Helper function to format date values nicely
function formatValue(value: any, type: TaskFieldConfig['type']): string {
  if (value === null || value === undefined) {
    return 'Not set';
  }
  if ((type === 'date' || type === 'datetime') && value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'None';
  }
  return String(value);
}

/**
 * Fetches task details and formats them into a comprehensive context string for the AI.
 * Includes field descriptions and options based on TASK_FIELD_CONFIG.
 * @param taskId The ID of the task to fetch context for.
 * @returns A formatted string containing the task details or null if not found.
 */
export async function getContextForTask(taskId: string): Promise<string | null> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return null;
    }

    let contextString = `Context for Task (ID: ${taskId}):\n---\n`;

    for (const [fieldId, config] of Object.entries(TASK_FIELD_CONFIG)) {
      // Skip fields not directly relevant or purely structural
      if (['divider', 'readonly', 'file', 'subtasks'].includes(config.type)) {
          continue;
      }

      const value = (task as any)[fieldId]; // Get current value
      const formattedVal = formatValue(value, config.type);

      contextString += `**${config.label} (${fieldId})**: ${formattedVal}\n`;
      contextString += `  - Type: ${config.type}\n`;
      if (config.description) {
        contextString += `  - Description: ${config.description}\n`;
      }
      if (config.options && config.options.length > 0) {
        contextString += `  - Options: [${config.options.join(', ')}]\n`;
      }
       contextString += `\n`; // Add a newline for readability between fields
    }
    
    contextString += '---\nEnd of Task Context.\n';

    // console.log('Generated Context String:', contextString); // Optional: Log generated context
    return contextString;

  } catch (error) {
    console.error(`Error fetching context for task ${taskId}:`, error);
    return `Error fetching context for task ${taskId}.`; // Return error message as context
  }
}
