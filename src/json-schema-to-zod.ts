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
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
  additionalProperties?: boolean | JsonSchemaProperty;
  default?: unknown;
}

export function jsonSchemaToZod(schema: JsonSchemaProperty): z.ZodTypeAny {
  let result: z.ZodTypeAny;

  // Handle OpenAPI 3.1 type arrays like ["string", "null"]
  if (Array.isArray(schema.type)) {
    const types = schema.type as string[];
    const isNullable = types.includes('null');
    const nonNullType = types.find((t) => t !== 'null') ?? 'string';
    const inner = jsonSchemaToZod({ ...schema, type: nonNullType });
    return isNullable ? inner.nullable() : inner;
  }

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
          const hasDefault = 'default' in propSchema;
          const isReadOnly = (propSchema as Record<string, unknown>).readOnly === true;
          shape[key] = required.includes(key) && !hasDefault && !isReadOnly ? zodType : zodType.optional();
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
