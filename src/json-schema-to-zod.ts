import { z } from 'zod';

export interface JsonSchemaProperty {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  enum?: unknown[];
  $ref?: string;
  nullable?: boolean;
  allOf?: JsonSchemaProperty[];
}

export function jsonSchemaToZod(schema: JsonSchemaProperty): z.ZodTypeAny {
  let result: z.ZodTypeAny;

  // Handle allOf by merging properties from all sub-schemas
  if (schema.allOf && schema.allOf.length > 0) {
    const mergedProperties: Record<string, JsonSchemaProperty> = {};
    const mergedRequired: string[] = [];
    for (const subSchema of schema.allOf) {
      if (subSchema.properties) {
        Object.assign(mergedProperties, subSchema.properties);
      }
      if (subSchema.required) {
        mergedRequired.push(...subSchema.required);
      }
    }
    // Also merge properties from the parent schema itself
    if (schema.properties) {
      Object.assign(mergedProperties, schema.properties);
    }
    if (schema.required) {
      mergedRequired.push(...schema.required);
    }
    const merged: JsonSchemaProperty = {
      type: 'object',
      properties: mergedProperties,
      required: mergedRequired.length > 0 ? mergedRequired : undefined,
    };
    return jsonSchemaToZod(merged);
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum && schema.enum.length > 0) {
        const stringValues = schema.enum.filter((v): v is string => typeof v === 'string');
        if (stringValues.length > 0) {
          const values = stringValues as [string, ...string[]];
          result = z.enum(values);
          break;
        }
      }
      result = z.string();
      break;
    case 'integer':
    case 'number':
      if (schema.enum && schema.enum.length > 0) {
        if (schema.enum.length === 1) {
          result = z.literal(schema.enum[0] as number);
          break;
        }
        const literals = schema.enum.map((v) => z.literal(v as number));
        result = z.union(literals as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]);
        break;
      }
      result = z.number();
      break;
    case 'boolean':
      result = z.boolean();
      break;
    case 'array':
      if (schema.items) {
        result = z.array(jsonSchemaToZod(schema.items));
        break;
      }
      result = z.array(z.unknown());
      break;
    case 'object':
      if (schema.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        const required = schema.required ?? [];
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const zodType = jsonSchemaToZod(propSchema);
          shape[key] = required.includes(key) ? zodType : zodType.optional();
        }
        result = z.object(shape);
        break;
      }
      result = z.record(z.unknown());
      break;
    default:
      result = z.string();
      break;
  }

  if (schema.nullable) {
    return result.nullable();
  }
  return result;
}
