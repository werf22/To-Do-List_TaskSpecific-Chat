import { Prisma } from '@prisma/client';
import { z } from 'zod'; // Import Zod
import { TASK_FIELD_CONFIG, TaskFieldConfig } from '@/config/TASK_FIELD_CONFIG';

// Define the schema for the streaming response object
// This describes the data structure the API route can stream back.
export const PartialTaskSchema = z.object({
  tool_results: z.array(z.object({
    tool_call_id: z.string(),
    result: z.any(), // Can be complex, use z.any() for flexibility or define more strictly
  })).optional(),
  task: z.record(z.any()).optional(), // Represents the updated task state (use z.any() or a more specific schema)
  reply: z.any().optional(), // For direct text replies or other object types
});

// Helper to convert Prisma types to JSON Schema types for AI
const mapPrismaTypeToJsonSchemaType = (prismaType: string): string => {
  switch (prismaType) {
    case 'String':
    case 'DateTime': // Represent DateTime as String for AI simplicity
    case 'Json': // Represent Json as String or Object? Object might be better if structured
      return 'string';
    case 'Int':
    case 'Float':
      return 'number';
    case 'Boolean':
      return 'boolean';
    // Add other mappings as needed (e.g., Enum)
    default:
      // Check if it's an Enum defined in Prisma schema
      const enumDef = Prisma.dmmf.datamodel.enums.find(e => e.name === prismaType);
      if (enumDef) {
        return 'string'; // Represent Enums as strings for JSON schema
      }
      return 'string'; // Default fallback
  }
};

/**
 * Helper function to map Prisma type strings (like 'String', 'DateTime', 'Int', 'Boolean')
 * to their corresponding Zod schema types.
 *
 * @param prismaType - The Prisma type string (e.g., 'String', 'DateTime').
 * @param isList - Boolean indicating if the field is an array/list.
 * @returns The corresponding Zod schema type (e.g., z.string(), z.array(z.string())).
 */
export const mapPrismaTypeToZod = (prismaType: string, isList: boolean = false): z.ZodTypeAny => {
  let zodType: z.ZodTypeAny;

  switch (prismaType) {
    case 'String':
      zodType = z.string();
      break;
    case 'DateTime':
      // Validate as string, but specifically ISO 8601 format
      zodType = z.string().datetime({ message: "Invalid ISO 8601 DateTime format" });
      break;
    case 'Int':
      zodType = z.number().int();
      break;
    case 'Float':
      zodType = z.number();
      break;
    case 'Boolean':
      zodType = z.boolean();
      break;
    case 'Json':
      zodType = z.any(); // Or z.record(z.any()) or a more specific structure if known
      break;
    // Add cases for Enums if necessary, potentially using z.enum()
    // Requires fetching enum values, might be complex here
    // Example: case 'StatusEnum': return z.enum(['PENDING', 'COMPLETED']);
    default:
      // Fallback for unhandled Prisma types (including Enums not explicitly handled)
      zodType = z.any(); // Use z.any() as a safe fallback
      break;
  }

  if (isList) {
    return z.array(zodType);
  }

  return zodType;
};

// Helper to get enum values from TASK_FIELD_CONFIG OR Prisma DMMF
const getEnumOptions = (fieldName: keyof TaskFieldConfig, prismaField: Prisma.DMMF.Field | undefined): string[] | undefined => {
  const config = TASK_FIELD_CONFIG[fieldName];

  // Check type and existence of options - Use correct types from interface
  if (config && (config.type === 'dropdown' || config.type === 'multi-select')) {
    // Assert options exist and match the expected structure (string[] or {value, label}[])
    const options = (config as any).options as (string | { value: string; label: string })[] | undefined;
    if (options && Array.isArray(options) && options.length > 0) {
        const firstOption = options[0];
        if (typeof firstOption === 'string') {
          return options as string[];
        } else if (typeof firstOption === 'object' && firstOption !== null && 'value' in firstOption) {
          return (options as { value: string; label: string }[]).map(opt => opt.value);
        }
    }
    return []; // Return empty array if options exist but are empty or malformed
  }

  // Fallback to Prisma DMMF if it's an Enum type
  if (prismaField?.kind === 'enum') {
      const enumDef = Prisma.dmmf.datamodel.enums.find(e => e.name === prismaField.type);
      return enumDef?.values.map(v => v.name);
  }

  return undefined;
};

/**
 * Generates a concise JSON schema description of the Task model fields
 * suitable for providing context to an AI model.
 * It uses TASK_FIELD_CONFIG for descriptions and options, falling back to Prisma DMMF.
 */
export async function getTaskFieldsSchemaForAI(): Promise<Record<string, any>> {
  const schema: Record<string, any> = {};
  const excludedFields = ['id', 'created_at', 'updated_at']; // Fields AI shouldn't typically set directly
  const alwaysInclude = ['title', 'status', 'priority']; // Ensure core fields are always present

  // Get Prisma model info
  const taskModel = Prisma.dmmf.datamodel.models.find(m => m.name === 'Task');

  if (!taskModel) {
    console.error('Prisma Task model not found in DMMF.');
    return {};
  }

  taskModel.fields.forEach(field => {
    const fieldName = field.name as keyof TaskFieldConfig; // Cast for TASK_FIELD_CONFIG access

    // Skip explicitly excluded fields unless they are in the alwaysInclude list
    if (excludedFields.includes(fieldName) && !alwaysInclude.includes(fieldName)) {
      return;
    }

    // Skip fields not present in our explicit TASK_FIELD_CONFIG unless they are core fields
    if (!TASK_FIELD_CONFIG[fieldName] && !alwaysInclude.includes(fieldName)) {
         console.warn(`Field "${fieldName}" exists in Prisma but not in TASK_FIELD_CONFIG. Skipping for AI schema unless always included.`);
        return;
    }


    const config = TASK_FIELD_CONFIG[fieldName];
    const schemaType = mapPrismaTypeToJsonSchemaType(field.type);
    const enumOptions = getEnumOptions(fieldName, field);

    const fieldSchema: any = {
      // Use JSON schema type, handle arrays
      type: field.isList ? 'array' : schemaType,
      // Use description from config, fallback to field name
      description: config?.description || field.name,
    };

    if (field.isList) {
      // Define item type for arrays
      fieldSchema.items = { type: mapPrismaTypeToJsonSchemaType(field.type) }; // Re-map base type for items
        // If items have enum options (multiselect)
       const derivedEnumOptions = getEnumOptions(fieldName as keyof TaskFieldConfig, field);
       if (derivedEnumOptions) {
           fieldSchema.items.enum = derivedEnumOptions;
           fieldSchema.items.type = 'string'; // Enum items are always strings
           fieldSchema.description += ` (Select multiple from: ${derivedEnumOptions.join(', ')})`;

       } else {
           fieldSchema.description += ` (List of ${fieldSchema.items.type})`;
       }

    } else if (enumOptions) {
      // Handle single-value enums (select)
      fieldSchema.type = 'string'; // Enums are represented as strings
      fieldSchema.enum = enumOptions;
      fieldSchema.description += ` (Must be one of: ${enumOptions.join(', ')})`;
    }

    // Mark optional fields (unless it's explicitly required elsewhere, Prisma optionality is a good default)
    // if (!field.isRequired) {
    //   // Handled by function call definition making all params optional by default
    // }

    // Add specific constraints or notes from config if available
    // e.g., if (config?.validation) fieldSchema.pattern = config.validation.pattern;

    schema[fieldName] = fieldSchema;
  });

  return schema;
};

/**
 * Generates a Zod object schema suitable for validating AI tool arguments.
 * Uses TASK_FIELD_CONFIG and mapPrismaTypeToZod to determine field types.
 * All fields are marked as optional, as the AI might only update a subset.
 */
export function generateTaskToolZodSchema(): z.ZodObject<any> { // Return type explicitly ZodObject
  const zodSchemaShape: Record<string, z.ZodTypeAny> = {};
  const taskModel = Prisma.dmmf.datamodel.models.find(m => m.name === 'Task');

  if (!taskModel) {
    console.error('Prisma Task model not found in DMMF for Zod schema generation.');
    return z.object({}); // Return empty schema on error
  }

  // Iterate through fields defined in TASK_FIELD_CONFIG to ensure relevance
  for (const fieldName in TASK_FIELD_CONFIG) {
    const config = TASK_FIELD_CONFIG[fieldName];
    const prismaField = taskModel.fields.find(f => f.name === fieldName);

    if (!prismaField) {
        console.warn(`Field "${fieldName}" from TASK_FIELD_CONFIG not found in Prisma model. Skipping for Zod tool schema.`);
        continue;
    }

    // Skip non-editable fields if necessary (though config currently forces editable)
    if (!config.editable) {
      // console.log(`Skipping non-editable field: ${fieldName}`);
      // continue; // Let's include all configured fields for now, AI might still *try*
    }

    // Determine the base Zod type using the Prisma type and list status
    let fieldZodType = mapPrismaTypeToZod(prismaField.type, prismaField.isList);

    // Handle enums specifically for dropdown/multi-select using config options
    if (config.type === 'dropdown' || config.type === 'multi-select') {
        const options = getEnumOptions(fieldName as keyof TaskFieldConfig, prismaField);
        if (options && options.length > 0) {
            const zodEnumSchema = z.enum(options as [string, ...string[]]); // Ensure non-empty array for enum
            if (prismaField.isList || config.multi) {
                fieldZodType = z.array(zodEnumSchema);
            } else {
                fieldZodType = zodEnumSchema;
            }
        } else {
             // If options are somehow empty/invalid, fall back to string/array of strings
             console.warn(`Field "${fieldName}" is dropdown/multi-select but has no valid options in config/prisma. Falling back to string/array.`);
             fieldZodType = prismaField.isList ? z.array(z.string()) : z.string();
        }
    }

    // Make the field optional in the Zod schema for the tool
    zodSchemaShape[fieldName] = fieldZodType.optional();
  }

  return z.object(zodSchemaShape);
}

console.log('schemaUtils loaded - refined + PartialTaskSchema added');
console.log('generateTaskToolZodSchema function added.');
