import { openApiToTools } from '../src/openapi-to-tools';
import type { OpenAPIObject } from '@nestjs/swagger';

describe('openApiToTools', () => {
  const minimalDoc = {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0' },
    paths: {
      '/tasks': {
        get: {
          tags: ['tasks'],
          summary: 'List all tasks',
          operationId: '',
          parameters: [],
          responses: { '200': { description: 'OK' } },
        },
        post: {
          tags: ['tasks'],
          summary: 'Create a new task',
          operationId: '',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['title'],
                },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
      '/tasks/{id}': {
        get: {
          tags: ['tasks'],
          summary: 'Get a task by ID',
          operationId: '',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: { '200': { description: 'OK' } },
        },
        patch: {
          tags: ['tasks'],
          summary: 'Update a task',
          operationId: '',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    done: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'OK' } },
        },
        delete: {
          tags: ['tasks'],
          summary: 'Delete a task',
          operationId: '',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: { '204': { description: 'No Content' } },
        },
      },
    },
  } as unknown as OpenAPIObject;

  it('should generate one tool per operation', () => {
    const tools = openApiToTools(minimalDoc);
    expect(tools).toHaveLength(5);
  });

  it('should derive tool names from tag and method/path', () => {
    const tools = openApiToTools(minimalDoc);
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'tasks_list',
        'tasks_create',
        'tasks_get',
        'tasks_update',
        'tasks_delete',
      ]),
    );
  });

  it('should use summary as description', () => {
    const tools = openApiToTools(minimalDoc);
    const listTool = tools.find((t) => t.name === 'tasks_list')!;
    expect(listTool.description).toBe('List all tasks');
  });

  it('should include path params as required in inputSchema', () => {
    const tools = openApiToTools(minimalDoc);
    const getTool = tools.find((t) => t.name === 'tasks_get')!;
    expect(getTool.inputSchema.properties).toHaveProperty('id');
    expect(getTool.inputSchema.required).toContain('id');
  });

  it('should include request body properties in inputSchema', () => {
    const tools = openApiToTools(minimalDoc);
    const createTool = tools.find((t) => t.name === 'tasks_create')!;
    expect(createTool.inputSchema.properties).toHaveProperty('title');
    expect(createTool.inputSchema.properties).toHaveProperty('description');
    expect(createTool.inputSchema.required).toContain('title');
  });

  it('should merge path params and body into one inputSchema', () => {
    const tools = openApiToTools(minimalDoc);
    const updateTool = tools.find((t) => t.name === 'tasks_update')!;
    expect(updateTool.inputSchema.properties).toHaveProperty('id');
    expect(updateTool.inputSchema.properties).toHaveProperty('title');
    expect(updateTool.inputSchema.properties).toHaveProperty('done');
    expect(updateTool.inputSchema.required).toContain('id');
  });

  it('should set method and path on each tool', () => {
    const tools = openApiToTools(minimalDoc);
    const createTool = tools.find((t) => t.name === 'tasks_create')!;
    expect(createTool.method).toBe('post');
    expect(createTool.path).toBe('/tasks');
  });

  it('should use operationId as name when provided', () => {
    const docWithOpId = JSON.parse(JSON.stringify(minimalDoc));
    docWithOpId.paths['/tasks'].get.operationId = 'myCustomListOp';
    const tools = openApiToTools(docWithOpId);
    const listTool = tools.find((t) => t.name === 'myCustomListOp');
    expect(listTool).toBeDefined();
  });

  it('should build tools from Xquik OpenAPI 3.1 search fixture', () => {
    const xquikDoc = {
      openapi: '3.1.0',
      info: { title: 'Xquik API', version: '1.0' },
      servers: [{ url: 'https://xquik.com' }],
      security: [{ apiKey: [] }],
      paths: {
        '/api/v1/x/tweets/search': {
          get: {
            tags: ['x'],
            summary: 'Search X posts',
            operationId: 'searchTweets',
            security: [{ apiKey: [] }],
            parameters: [
              {
                name: 'q',
                in: 'query',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'limit',
                in: 'query',
                required: false,
                schema: { type: 'integer', minimum: 1, maximum: 100 },
              },
            ],
            responses: { '200': { description: 'Search results' } },
          },
        },
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
          },
        },
      },
    } as unknown as OpenAPIObject;

    const tools = openApiToTools(xquikDoc);

    expect(tools).toHaveLength(1);
    const searchTool = tools[0];
    expect(searchTool.name).toBe('searchTweets');
    expect(searchTool.description).toBe('Search X posts');
    expect(searchTool.method).toBe('get');
    expect(searchTool.path).toBe('/api/v1/x/tweets/search');
    expect(searchTool.queryParams).toEqual(['q', 'limit']);
    expect(searchTool.inputSchema.required).toContain('q');
    expect(searchTool.inputSchema.properties).toHaveProperty('limit');
  });

  it('should skip multipart/form-data operations', () => {
    const docWithUpload = JSON.parse(JSON.stringify(minimalDoc));
    docWithUpload.paths['/tasks'].post.requestBody = {
      content: { 'multipart/form-data': { schema: { type: 'object' } } },
    };
    const tools = openApiToTools(docWithUpload);
    const createTool = tools.find((t) => t.name === 'tasks_create');
    expect(createTool).toBeUndefined();
  });

  it('should use "default" tag when none provided', () => {
    const docNoTag = JSON.parse(JSON.stringify(minimalDoc));
    delete docNoTag.paths['/tasks'].get.tags;
    const tools = openApiToTools(docNoTag);
    const listTool = tools.find((t) => t.name === 'default_list');
    expect(listTool).toBeDefined();
  });

  it('should track path params separately', () => {
    const tools = openApiToTools(minimalDoc);
    const getTool = tools.find((t) => t.name === 'tasks_get')!;
    expect(getTool.pathParams).toEqual(['id']);
    expect(getTool.queryParams).toEqual([]);
    expect(getTool.bodyParams).toEqual([]);
  });

  it('should track body params separately', () => {
    const tools = openApiToTools(minimalDoc);
    const createTool = tools.find((t) => t.name === 'tasks_create')!;
    expect(createTool.pathParams).toEqual([]);
    expect(createTool.bodyParams).toEqual(['title', 'description']);
  });

  it('should track query params separately', () => {
    const docWithQuery = JSON.parse(JSON.stringify(minimalDoc));
    docWithQuery.paths['/tasks'].get.parameters = [
      { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
    ];
    const tools = openApiToTools(docWithQuery);
    const listTool = tools.find((t) => t.name === 'tasks_list')!;
    expect(listTool.queryParams).toEqual(['status']);
  });

  it('should filter by includeTags', () => {
    const tools = openApiToTools(minimalDoc, { includeTags: ['tasks'] });
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.name).toMatch(/tasks|TasksController/);
    }
  });

  it('should exclude with excludeTags', () => {
    const tools = openApiToTools(minimalDoc, { excludeTags: ['tasks'] });
    expect(tools).toHaveLength(0);
  });

  it('should treat includeTags as higher priority than excludeTags', () => {
    const tools = openApiToTools(minimalDoc, {
      includeTags: ['tasks'],
      excludeTags: ['tasks'],
    });
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should include untagged operations when includeTags contains "default"', () => {
    const docNoTag = JSON.parse(JSON.stringify(minimalDoc));
    delete docNoTag.paths['/tasks'].get.tags;
    const tools = openApiToTools(docNoTag, { includeTags: ['default'] });
    const listTool = tools.find((t) => t.name === 'default_list');
    expect(listTool).toBeDefined();
  });

  it('should use custom nameFormatter when provided', () => {
    const tools = openApiToTools(minimalDoc, {
      nameFormatter: ({ method, path }) => `${method}_${path.replace(/[/{}]/g, '_')}`,
    });
    const listTool = tools.find((t) => t.name === 'get__tasks');
    expect(listTool).toBeDefined();
  });

  it('should strip schema details when compactSchemas is true', () => {
    const docWithExamples = JSON.parse(JSON.stringify(minimalDoc));
    docWithExamples.paths['/tasks'].post.requestBody.content['application/json'].schema.properties.title = {
      type: 'string',
      example: 'Buy groceries',
      description: 'The task title',
      minLength: 1,
      maxLength: 255,
    };
    const tools = openApiToTools(docWithExamples, {
      tokenOptimization: { compactSchemas: true },
    });
    const createTool = tools.find((t) => t.name === 'tasks_create')!;
    const titleProp = createTool.inputSchema.properties.title as Record<string, unknown>;
    expect(titleProp).toEqual({ type: 'string' });
    expect(titleProp).not.toHaveProperty('example');
    expect(titleProp).not.toHaveProperty('description');
    expect(titleProp).not.toHaveProperty('minLength');
  });

  it('should truncate descriptions when maxDescriptionLength is set', () => {
    const tools = openApiToTools(minimalDoc, {
      tokenOptimization: { maxDescriptionLength: 10 },
    });
    const listTool = tools.find((t) => t.name === 'tasks_list')!;
    expect(listTool.description).toBe('List all t...');
    expect(listTool.description.length).toBeLessThanOrEqual(13);
  });

  it('should set empty description when maxDescriptionLength is 0', () => {
    const tools = openApiToTools(minimalDoc, {
      tokenOptimization: { maxDescriptionLength: 0 },
    });
    const listTool = tools.find((t) => t.name === 'tasks_list')!;
    expect(listTool.description).toBe('');
  });

  it('should use provided logger instead of console.warn', () => {
    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };
    const docWithUpload = JSON.parse(JSON.stringify(minimalDoc));
    docWithUpload.paths['/tasks'].post.requestBody = {
      content: { 'multipart/form-data': { schema: { type: 'object' } } },
    };
    openApiToTools(docWithUpload, { logger });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Skipping multipart');
  });

  it('should resolve $ref in parameters', () => {
    const docWithParamRef = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      components: {
        parameters: {
          IdParam: {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        },
      },
      paths: {
        '/items/{id}': {
          get: {
            tags: ['items'],
            summary: 'Get item',
            operationId: '',
            parameters: [
              { $ref: '#/components/parameters/IdParam' },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    } as unknown as OpenAPIObject;

    const tools = openApiToTools(docWithParamRef);
    const getTool = tools.find((t) => t.name === 'items_get')!;
    expect(getTool).toBeDefined();
    expect(getTool.inputSchema.properties).toHaveProperty('id');
    expect(getTool.inputSchema.required).toContain('id');
    expect(getTool.pathParams).toContain('id');
  });

  it('should preserve nested structure when compactSchemas is true', () => {
    const docWithNested = JSON.parse(JSON.stringify(minimalDoc));
    docWithNested.paths['/tasks'].post.requestBody.content['application/json'].schema.properties.metadata = {
      type: 'object',
      description: 'Extra data',
      properties: {
        priority: { type: 'integer', example: 1, minimum: 0 },
      },
      required: ['priority'],
    };
    const tools = openApiToTools(docWithNested, {
      tokenOptimization: { compactSchemas: true },
    });
    const createTool = tools.find((t) => t.name === 'tasks_create')!;
    const metadata = createTool.inputSchema.properties.metadata as Record<string, unknown>;
    expect(metadata).toHaveProperty('type', 'object');
    expect(metadata).toHaveProperty('properties');
    expect(metadata).toHaveProperty('required');
    const priority = (metadata.properties as Record<string, unknown>).priority as Record<string, unknown>;
    expect(priority).toEqual({ type: 'integer' });
  });

  it('should warn and skip body property that collides with path param', () => {
    const warnings: string[] = [];
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {
        '/items/{id}': {
          patch: {
            tags: ['items'],
            summary: 'Update item',
            operationId: '',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { id: { type: 'string' }, name: { type: 'string' } },
                  },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    } as unknown as OpenAPIObject;
    const tools = openApiToTools(doc, { logger: { warn: (msg) => warnings.push(msg) } });
    const tool = tools[0];
    expect(tool.inputSchema.properties.id).toEqual({ type: 'integer' }); // path param wins
    expect(tool.bodyParams).not.toContain('id');
    expect(warnings.some((w) => w.includes('collides'))).toBe(true);
  });

  it('should resolve $ref in body property schemas', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      components: {
        schemas: {
          Address: {
            type: 'object',
            properties: { street: { type: 'string' }, city: { type: 'string' } },
            required: ['street'],
          },
        },
      },
      paths: {
        '/users': {
          post: {
            tags: ['users'],
            summary: 'Create user',
            operationId: '',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      address: { $ref: '#/components/schemas/Address' },
                    },
                    required: ['name'],
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    } as unknown as OpenAPIObject;

    const tools = openApiToTools(doc);
    const tool = tools[0];
    const address = tool.inputSchema.properties.address;
    expect(address).toHaveProperty('type', 'object');
    expect(address).toHaveProperty('properties');
  });

  it('should skip header and cookie params from tool input', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {
        '/items': {
          get: {
            tags: ['items'],
            summary: 'List items',
            operationId: '',
            parameters: [
              { name: 'X-Api-Key', in: 'header', schema: { type: 'string' } },
              { name: 'session', in: 'cookie', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    } as unknown as OpenAPIObject;

    const tools = openApiToTools(doc);
    const tool = tools[0];
    expect(tool.inputSchema.properties).not.toHaveProperty('X-Api-Key');
    expect(tool.inputSchema.properties).not.toHaveProperty('session');
    expect(tool.inputSchema.properties).toHaveProperty('limit');
  });

  it('should deduplicate tool names', () => {
    const docDup = JSON.parse(JSON.stringify(minimalDoc));
    // Add another GET endpoint under the same tag without path params
    docDup.paths['/tasks/archived'] = {
      get: {
        tags: ['tasks'],
        summary: 'List archived tasks',
        operationId: '',
        parameters: [],
        responses: { '200': { description: 'OK' } },
      },
    };
    const tools = openApiToTools(docDup);
    const names = tools.map((t) => t.name);
    // Both would be "tasks_list" without dedup
    expect(names).toContain('tasks_list');
    expect(names).toContain('tasks_list_2');
  });
});
