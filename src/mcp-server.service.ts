import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { openApiToTools, type ToolDefinition } from './openapi-to-tools';
import { MCP_MODULE_OPTIONS, type McpModuleOptions } from './mcp-config';
import { jsonSchemaToZod } from './json-schema-to-zod';
import type { Request, Response } from 'express';

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);
  private tools: ToolDefinition[] = [];
  private baseUrl = '';
  private initialized = false;

  constructor(
    @Inject(MCP_MODULE_OPTIONS) private readonly options: McpModuleOptions,
  ) {}

  initialize(document: OpenAPIObject, baseUrl: string): void {
    this.baseUrl = baseUrl;
    this.tools = openApiToTools(document, {
      includeTags: this.options.includeTags,
      excludeTags: this.options.excludeTags,
      nameFormatter: this.options.nameFormatter,
      tokenOptimization: this.options.tokenOptimization,
      logger: this.logger,
    });
    this.initialized = true;
    this.logger.log(
      `Registered ${this.tools.length} MCP tools from OpenAPI spec`,
    );
    for (const tool of this.tools) {
      this.logger.debug(`  Tool: ${tool.name} — ${tool.description}`);
    }
  }

  private registerToolOnServer(
    server: McpServer,
    tool: ToolDefinition,
    requestHeaders?: Record<string, string>,
  ): void {
    const inputSchema = jsonSchemaToZod({
      type: 'object',
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required,
    });

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: inputSchema as any,
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await this.callApi(tool, args, requestHeaders);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        } catch (error: unknown) {
          if (error instanceof HttpError) {
            return {
              content: [{ type: 'text' as const, text: `${error.status}: ${error.message}` }],
              isError: true,
            };
          }
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [{ type: 'text' as const, text: `500: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  private async callApi(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<unknown> {
    let url = tool.path;
    for (const paramName of tool.pathParams) {
      url = url.replaceAll(`{${paramName}}`, encodeURIComponent(String(args[paramName])));
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const fetchUrl = new URL(url, this.baseUrl);
    const init: RequestInit = {
      method: tool.method.toUpperCase(),
      headers,
    };

    // Query params go to URL search params
    for (const paramName of tool.queryParams) {
      if (args[paramName] !== undefined) {
        const value = args[paramName];
        if (Array.isArray(value)) {
          for (const item of value) {
            fetchUrl.searchParams.append(paramName, String(item));
          }
        } else {
          fetchUrl.searchParams.set(paramName, String(value));
        }
      }
    }

    // Body params go to request body for methods that support it
    if (['post', 'put', 'patch', 'delete'].includes(tool.method)) {
      const body: Record<string, unknown> = {};
      for (const paramName of tool.bodyParams) {
        if (args[paramName] !== undefined) {
          body[paramName] = args[paramName];
        }
      }
      if (Object.keys(body).length > 0) {
        init.body = JSON.stringify(body);
      }
    }

    const response = await fetch(fetchUrl, init);
    const text = await response.text();

    if (!response.ok) {
      throw new HttpError(response.status, text || response.statusText);
    }

    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async handleRequest(req: Request, res: Response): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        'McpServerService not initialized. Call McpModule.setup() after app.listen().',
      );
    }

    // Extract headers to forward
    let forwardedHeaders: Record<string, string> | undefined;
    if (this.options.forwardHeaders?.length) {
      forwardedHeaders = {};
      for (const header of this.options.forwardHeaders) {
        const value = req.headers[header.toLowerCase()];
        if (typeof value === 'string') {
          forwardedHeaders[header] = value;
        }
      }
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const server = new McpServer({
      name: this.options.name,
      version: this.options.version ?? '1.0.0',
    });

    for (const tool of this.tools) {
      this.registerToolOnServer(server, tool, forwardedHeaders);
    }

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      await server.close();
    }
  }
}
