import type { OpenAPIObject } from '@nestjs/swagger';
import type { JsonSchemaProperty } from './json-schema-to-zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  method: string;
  path: string;
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
  isArrayBody: boolean;
}

interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    required?: boolean;
    schema?: Record<string, unknown>;
  }>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<string, unknown>;
}

export interface OpenApiToToolsOptions {
  includeTags?: string[];
  excludeTags?: string[];
  nameFormatter?: (context: {
    method: string;
    path: string;
    tags: string[];
    operationId?: string;
  }) => string;
  tokenOptimization?: {
    compactSchemas?: boolean;
    maxDescriptionLength?: number;
  };
  logger?: { warn: (msg: string) => void };
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const METHOD_SUFFIX_MAP: Record<string, string> = {
  get: 'get',
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'delete',
};

function deriveToolName(
  method: string,
  path: string,
  tags?: string[],
  operationId?: string,
): string {
  if (operationId) return operationId;

  const tag = tags?.[0] ?? 'default';
  const hasPathParam = /\{[^}]+\}/.test(path);
  let suffix = METHOD_SUFFIX_MAP[method] ?? method;

  if (method === 'get' && !hasPathParam) {
    suffix = 'list';
  }

  return `${tag}_${suffix}`;
}

function isMultipart(operation: OpenApiOperation): boolean {
  const content = operation.requestBody?.content;
  if (!content) return false;
  return 'multipart/form-data' in content && !('application/json' in content);
}

function resolveRef(
  doc: OpenAPIObject,
  schema: JsonSchemaProperty | undefined,
  logger?: { warn: (msg: string) => void },
  visited?: Set<string>,
): JsonSchemaProperty | undefined {
  if (!schema?.$ref) return schema;
  const refs = visited ?? new Set<string>();
  if (refs.has(schema.$ref)) {
    (logger ?? console).warn(`Circular $ref detected: ${schema.$ref}`);
    return undefined;
  }
  refs.add(schema.$ref);

  const refPath = schema.$ref.replace('#/', '').split('/');
  const resolved = refPath.reduce<unknown>(
    (obj, segment) => (obj != null && typeof obj === 'object') ? (obj as Record<string, unknown>)[segment] : undefined,
    doc,
  );

  if (resolved == null || typeof resolved !== 'object') {
    (logger ?? console).warn(`Failed to resolve $ref: ${schema.$ref}`);
    return undefined;
  }

  const result = resolved as JsonSchemaProperty;

  if (result.$ref) {
    return resolveRef(doc, result, logger, refs);
  }

  return result;
}

function resolveSchemaDeep(
  doc: OpenAPIObject,
  schema: JsonSchemaProperty | undefined,
  logger?: { warn: (msg: string) => void },
  visited?: Set<string>,
): JsonSchemaProperty | undefined {
  if (!schema || typeof schema !== 'object') return schema;
  const refs = visited ?? new Set<string>();

  let resolved: JsonSchemaProperty = schema;
  if (resolved.$ref) {
    if (refs.has(resolved.$ref)) {
      (logger ?? console).warn(`Circular $ref detected in deep resolve: ${resolved.$ref}`);
      return { type: 'object' };
    }
    refs.add(resolved.$ref);
    resolved = resolveRef(doc, resolved, logger)!;
    if (!resolved) return undefined;
  }

  resolved = { ...resolved };

  if (resolved.properties) {
    const newProps: Record<string, JsonSchemaProperty> = {};
    for (const [key, propSchema] of Object.entries(resolved.properties)) {
      newProps[key] = resolveSchemaDeep(doc, propSchema, logger, new Set(refs)) ?? { type: 'string' };
    }
    resolved.properties = newProps;
  }

  if (resolved.items) {
    resolved.items = resolveSchemaDeep(doc, resolved.items as JsonSchemaProperty, logger, new Set(refs)) ?? { type: 'string' };
  }

  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    if (resolved[key]) {
      (resolved as Record<string, unknown>)[key] = (resolved[key] as JsonSchemaProperty[]).map(
        (sub: JsonSchemaProperty) => resolveSchemaDeep(doc, sub, logger, new Set(refs)) ?? sub,
      );
    }
  }

  return resolved;
}

function deduplicateNames(tools: ToolDefinition[]): void {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  for (const tool of tools) {
    if ((counts.get(tool.name) ?? 0) <= 1) continue;
    const idx = (seen.get(tool.name) ?? 0) + 1;
    seen.set(tool.name, idx);
    if (idx > 1) {
      tool.name = `${tool.name}_${idx}`;
    }
  }
}

function compactSchema(properties: Record<string, JsonSchemaProperty>): Record<string, JsonSchemaProperty> {
  const STRUCTURAL_KEYS = new Set(['type', 'properties', 'items', 'required', 'enum', 'allOf']);
  const compacted: Record<string, JsonSchemaProperty> = {};
  for (const [key, value] of Object.entries(properties)) {
    const compact: JsonSchemaProperty = {};
    for (const [k, v] of Object.entries(value)) {
      if (STRUCTURAL_KEYS.has(k)) {
        if (k === 'properties') {
          compact.properties = compactSchema(v as Record<string, JsonSchemaProperty>);
        } else {
          (compact as Record<string, unknown>)[k] = v;
        }
      }
    }
    if (!compact.type) compact.type = 'string';
    compacted[key] = compact;
  }
  return compacted;
}

function truncateDescription(description: string, maxLength: number): string {
  if (maxLength === 0) return '';
  if (description.length <= maxLength) return description;
  return description.slice(0, maxLength) + '...';
}

export function openApiToTools(doc: OpenAPIObject, options?: OpenApiToToolsOptions): ToolDefinition[] {
  const log = options?.logger ?? console;
  const tools: ToolDefinition[] = [];

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, OpenApiOperation>)[method];
      if (!operation) continue;

      const operationTags = operation.tags ?? ['default'];
      if (options?.includeTags) {
        if (!operationTags.some((t) => options.includeTags!.includes(t))) continue;
      } else if (options?.excludeTags) {
        if (operationTags.some((t) => options.excludeTags!.includes(t))) continue;
      }

      if (isMultipart(operation)) {
        log.warn(
          `Skipping multipart operation: ${method.toUpperCase()} ${path}`,
        );
        continue;
      }

      const operationId = operation.operationId || undefined;
      const name = options?.nameFormatter
        ? options.nameFormatter({
            method,
            path,
            tags: operation.tags ?? [],
            operationId,
          })
        : deriveToolName(method, path, operation.tags, operationId);
      const description =
        operation.summary ?? `${method.toUpperCase()} ${path}`;

      const properties: Record<string, JsonSchemaProperty> = {};
      const required: string[] = [];
      const pathParams: string[] = [];
      const queryParams: string[] = [];
      const bodyParams: string[] = [];

      const resolvedParams = (operation.parameters ?? []).map((p) => {
        if ('$ref' in p) {
          return resolveRef(doc, p as unknown as JsonSchemaProperty, log) as unknown as typeof p;
        }
        return p;
      }).filter(Boolean);

      for (const param of resolvedParams) {
        if (param.in === 'header' || param.in === 'cookie') continue;
        properties[param.name] = (param.schema as JsonSchemaProperty | undefined) ?? { type: 'string' };
        if (param.required) {
          required.push(param.name);
        }
        if (param.in === 'path') {
          pathParams.push(param.name);
        } else if (param.in === 'query') {
          queryParams.push(param.name);
        }
      }

      const rawBodySchema = operation.requestBody?.content?.[
        'application/json'
      ]?.schema as JsonSchemaProperty | undefined;
      const bodySchema = resolveSchemaDeep(doc, rawBodySchema, log);
      let isArrayBody = false;

      if (bodySchema?.type === 'array' && bodySchema?.items) {
        isArrayBody = true;
        properties['items'] = {
          type: 'array',
          items: bodySchema.items as JsonSchemaProperty,
        };
        required.push('items');
        bodyParams.push('items');
      } else if (bodySchema?.properties) {
        for (const [propName, propSchema] of Object.entries(
          bodySchema.properties,
        )) {
          if (pathParams.includes(propName) || queryParams.includes(propName)) {
            log.warn(`Body property "${propName}" collides with path/query param in ${method.toUpperCase()} ${path}, skipping body property`);
            continue;
          }
          properties[propName] = propSchema ?? { type: 'string' };
          bodyParams.push(propName);
        }
        if (bodySchema.required) {
          required.push(...bodySchema.required);
        }
      }

      // Merge properties from allOf, oneOf, and anyOf sub-schemas
      const compositeSchemas = [
        ...(bodySchema?.allOf ?? []),
        ...(bodySchema?.oneOf ?? []),
        ...(bodySchema?.anyOf ?? []),
      ];
      if (compositeSchemas.length > 0) {
        const mergedProps: Record<string, JsonSchemaProperty> = {};
        const mergedRequired: string[] = [];
        for (const sub of compositeSchemas) {
          if (sub?.properties) {
            for (const [k, v] of Object.entries(sub.properties)) {
              if (mergedProps[k] && v.enum && mergedProps[k].enum) {
                // Merge enum values for oneOf/anyOf discriminators
                const combined = [...new Set([...mergedProps[k].enum!, ...v.enum])];
                mergedProps[k] = { ...v, enum: combined };
              } else {
                mergedProps[k] = v;
              }
            }
          }
          if (sub?.required) {
            mergedRequired.push(...sub.required);
          }
        }
        if (Object.keys(mergedProps).length > 0) {
          for (const [propName, propSchema] of Object.entries(mergedProps)) {
            if (pathParams.includes(propName) || queryParams.includes(propName)) {
              log.warn(`Body property "${propName}" collides with path/query param in ${method.toUpperCase()} ${path}, skipping body property`);
              continue;
            }
            properties[propName] = propSchema ?? { type: 'string' };
            bodyParams.push(propName);
          }
          // For allOf, all required fields apply; for oneOf/anyOf, none are strictly required
          if (bodySchema?.allOf && mergedRequired.length > 0) {
            required.push(...mergedRequired);
          }
        }
      }

      // Also merge sibling properties that sit alongside allOf/oneOf/anyOf
      if (bodySchema?.properties && (bodySchema?.allOf || bodySchema?.oneOf || bodySchema?.anyOf)) {
        for (const [propName, propSchema] of Object.entries(bodySchema.properties)) {
          if (properties[propName] || pathParams.includes(propName) || queryParams.includes(propName)) continue;
          properties[propName] = propSchema ?? { type: 'string' };
          bodyParams.push(propName);
        }
      }

      tools.push({
        name,
        description,
        inputSchema: {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
        method,
        path,
        pathParams,
        queryParams,
        bodyParams,
        isArrayBody,
      });
    }
  }

  if (options?.tokenOptimization) {
    const opt = options.tokenOptimization;
    for (const tool of tools) {
      if (opt.compactSchemas) {
        tool.inputSchema.properties = compactSchema(tool.inputSchema.properties);
      }
      if (opt.maxDescriptionLength !== undefined) {
        tool.description = truncateDescription(tool.description, opt.maxDescriptionLength);
      }
    }
  }

  deduplicateNames(tools);
  return tools;
}
