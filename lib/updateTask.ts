// /Users/test/Desktop/ToDoList_NEW/lib/updateTask.ts
import { PrismaClient, Task } from '@prisma/client';
import { Prisma } from '@prisma/client'; // Import Prisma namespace for DMMF access if needed

const prisma = new PrismaClient();

/**
 * Updates task fields in the database based on validated arguments.
 * Handles type conversions (e.g., string to Date) and potential errors.
 *
 * @param validatedArgs - An object containing the validated fields to update.
 *                        Keys are task field names, values are the new values.
 * @returns The updated task object.
 * @throws Error if the update fails (e.g., database error, missing task ID).
 */
export async function updateTaskFields(validatedArgs: Record<string, any>): Promise<Task> {
  // Ensure taskId is present, as it's required for the update operation.
  // The AI tool call should ideally always include the ID of the task being modified.
  // If not present in args, we might need to fetch it differently or throw an error.
  const taskId = validatedArgs.id || validatedArgs.task_id; // Adjust based on how ID is passed

  if (!taskId || typeof taskId !== 'string') {
    throw new Error('Task ID is missing or invalid in the update arguments.');
  }

  // Separate ID from the data payload
  const { id, task_id, ...dataToUpdateRaw } = validatedArgs;

  // Refine data: Convert date strings, handle potential type issues before sending to Prisma
  const dataToUpdate: Record<string, any> = {};
  const taskModel = Prisma.dmmf.datamodel.models.find(m => m.name === 'Task');

  for (const [key, value] of Object.entries(dataToUpdateRaw)) {
    if (value === undefined || value === null) {
        // Skip null/undefined unless specifically allowed by Prisma schema (e.g., setting a field to null)
        // Prisma usually handles nulls correctly if the field is nullable.
        // We might want to explicitly set null if the intent is clear.
        const field = taskModel?.fields.find(f => f.name === key);
         if (field?.isRequired === false) {
             dataToUpdate[key] = null; // Allow setting optional fields to null
         } else {
            console.warn(`Skipping update for required field '${key}' with null/undefined value.`);
         }
        continue;
    }

    const field = taskModel?.fields.find(f => f.name === key);

    // Convert valid date strings to Date objects
    if (field?.type === 'DateTime' && typeof value === 'string') {
      try {
        const date = new Date(value);
        // Basic check if the date is valid after parsing
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format provided for field '${key}': ${value}. Expected ISO 8601 format.`);
        }
        dataToUpdate[key] = date;
      } catch (dateError: any) {
        console.error(`Error parsing date string for field ${key}:`, value, dateError);
        // Re-throw to be caught by the main try-catch block in the API route
        throw new Error(`Invalid date format for field '${key}'. Expected ISO 8601 format, received: ${value}`);
      }
    } else {
      // Assign other types directly
      dataToUpdate[key] = value;
    }
  }


  console.log(`Attempting to update Task ID: ${taskId} with data:`, dataToUpdate);

  if (Object.keys(dataToUpdate).length === 0) {
      console.warn("No valid fields to update after processing arguments.");
      // Fetch and return the current task state if no updates are made
      const currentTask = await prisma.task.findUnique({ where: { id: taskId } });
      if (!currentTask) throw new Error(`Task with ID ${taskId} not found.`);
      return currentTask;
  }


  try {
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: dataToUpdate,
    });
    console.log(`Task ${taskId} updated successfully.`);
    return updatedTask;
  } catch (error: any) {
    console.error(`Error updating task ${taskId} in database:`, error);
    // Re-throw the error to be handled by the API route's error handling
    throw new Error(`Database update failed for task ${taskId}: ${error.message}`);
  }
}
