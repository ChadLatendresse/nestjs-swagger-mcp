import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { openApiToTools, type ToolDefinition } from './openapi-to-tools';
import {
  MCP_MODULE_OPTIONS,
  type DocumentFactory,
  type McpModuleOptions,
} from './mcp-config';
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
  private documentFactory: DocumentFactory | null = null;
  private lastRefreshAt = 0;

  constructor(
    @Inject(MCP_MODULE_OPTIONS) private readonly options: McpModuleOptions,
  ) {}

  /**
   * Accepts either a frozen document or a factory. Passing a factory enables
   * hot-reload: the spec is re-derived on demand so tool definitions track
   * code changes after a ts-node-dev respawn.
   */
  initialize(
    documentOrFactory: OpenAPIObject | DocumentFactory,
    baseUrl: string,
  ): void {
    this.baseUrl = baseUrl;
    this.documentFactory =
      typeof documentOrFactory === 'function'
        ? (documentOrFactory as DocumentFactory)
        : () => documentOrFactory;
    this.buildTools();
    this.initialized = true;
    this.logger.log(
      `Registered ${this.tools.length} MCP tools from OpenAPI spec`,
    );
    for (const tool of this.tools) {
      this.logger.debug(`  Tool: ${tool.name} — ${tool.description}`);
    }
  }

  private buildTools(): ToolDefinition[] {
    if (!this.documentFactory) {
      throw new Error('McpServerService: no documentFactory set');
    }
    this.tools = openApiToTools(this.documentFactory(), {
      includeTags: this.options.includeTags,
      excludeTags: this.options.excludeTags,
      nameFormatter: this.options.nameFormatter,
      tokenOptimization: this.options.tokenOptimization,
      logger: this.logger,
    });
    this.lastRefreshAt = Date.now();
    return this.tools;
  }

  /**
   * Re-run openApiToTools() against a freshly built document and swap
   * `this.tools`. Logs added/removed tool names. Idempotent.
   */
  refreshTools(): { added: string[]; removed: string[]; total: number } {
    const prev = new Map(this.tools.map((t) => [t.name, t]));
    this.buildTools();
    const next = new Set(this.tools.map((t) => t.name));
    const added: string[] = [];
    for (const name of next) if (!prev.has(name)) added.push(name);
    const removed: string[] = [];
    for (const name of prev.keys()) if (!next.has(name)) removed.push(name);
    if (added.length || removed.length) {
      this.logger.log(
        `MCP tools refreshed: +${added.length} / -${removed.length} (total ${this.tools.length})` +
          (added.length ? ` added=[${added.join(', ')}]` : '') +
          (removed.length ? ` removed=[${removed.join(', ')}]` : ''),
      );
    }
    return { added, removed, total: this.tools.length };
  }

  private isHotReloadEnabled(): boolean {
    return this.options.hotReload ?? process.env.NODE_ENV !== 'production';
  }

  isAdminRefreshEnabled(): boolean {
    return this.options.adminRefresh ?? this.isHotReloadEnabled();
  }

  checkAdminRefreshToken(provided: string | undefined): boolean {
    const expected = this.options.adminRefreshToken;
    if (!expected) return true;
    if (typeof provided !== 'string') return false;
    // Constant-time compare so a timing side-channel can't leak the token
    // one character at a time. timingSafeEqual requires equal-length buffers,
    // so length mismatch short-circuits to false.
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private maybeHotReload(): void {
    if (!this.isHotReloadEnabled()) return;
    const ttl = this.options.hotReloadTtlMs ?? 1000;
    if (Date.now() - this.lastRefreshAt < ttl) return;
    try {
      this.refreshTools();
    } catch (err) {
      this.logger.warn(
        `Hot-reload refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
      if (tool.isArrayBody && args['items'] !== undefined) {
        init.body = JSON.stringify(args['items']);
      } else if (tool.isFreeformBody && args['body'] !== undefined) {
        init.body = JSON.stringify(args['body']);
      } else {
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

    this.maybeHotReload();

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
