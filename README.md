# nestjs-swagger-mcp

[![npm version](https://img.shields.io/npm/v/nestjs-swagger-mcp.svg)](https://www.npmjs.com/package/nestjs-swagger-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Auto-generate [MCP](https://modelcontextprotocol.io/) tools from your NestJS Swagger/OpenAPI spec. Any endpoint decorated with `@nestjs/swagger` becomes an MCP tool that AI assistants can call directly.

Works with Claude Desktop, Cursor, VS Code Copilot, and any MCP-compatible client.

## Why?

If your NestJS API has Swagger documentation, this library exposes it as MCP tools with zero manual mapping. Add two lines of config and your AI assistant can list tasks, create records, or call any endpoint — using the types and descriptions you already wrote.

## Requirements

- Node.js >= 18
- NestJS >= 11
- `@nestjs/swagger` >= 11

## Install

```bash
npm install nestjs-swagger-mcp
```

Peer dependencies: `@nestjs/common`, `@nestjs/core`, `@nestjs/swagger` (all `^11.0.0`).

## Quick Start

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { McpModule } from 'nestjs-swagger-mcp';

@Module({
  imports: [
    McpModule.forRoot({ name: 'my-api-mcp' }),
    // ... your other modules
  ],
})
export class AppModule {}
```

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { McpModule } from 'nestjs-swagger-mcp';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('My API')
    .setVersion('1.0')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(3000);

  // Pass the same factory so MCP tools can be re-derived on demand.
  await McpModule.setup(app, { documentFactory });
}
bootstrap();
```

That's it. Your API is now accessible via MCP at `POST /mcp`.

## Options

### `McpModule.forRoot(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | *required* | MCP server name |
| `version` | `string` | `'1.0.0'` | MCP server version |
| `includeTags` | `string[]` | *all* | Only expose operations with these Swagger tags |
| `excludeTags` | `string[]` | *none* | Skip operations with these Swagger tags |
| `forwardHeaders` | `string[]` | *none* | Headers to pass from MCP request to API calls |
| `nameFormatter` | `(ctx) => string` | *auto* | Custom tool naming function (see below) |
| `tokenOptimization` | `{ compactSchemas?, maxDescriptionLength? }` | *none* | Reduce token usage for LLM clients |
| `hotReload` | `boolean` | `true` outside production | Re-derive the OpenAPI spec on each MCP request so tool definitions track code changes |
| `hotReloadTtlMs` | `number` | `1000` | Minimum ms between rescans; bursty requests reuse the last scan |
| `adminRefresh` | `boolean` | same as `hotReload` | Expose `POST /mcp/refresh` to force a tool rescan |
| `adminRefreshToken` | `string` | *none* | If set, `POST /mcp/refresh` requires header `x-mcp-refresh-token: <token>` |

### `McpModule.setup(app, options)`

Call after `app.listen()`. Pass a document factory (preferred) so the spec can be rebuilt on demand.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `documentFactory` | `() => OpenAPIObject` | *one of these required* | Factory that rebuilds the OpenAPI document — enables hot-reload |
| `document` | `OpenAPIObject` | *one of these required* | Pre-built OpenAPI document (frozen; no hot-reload) |
| `baseUrl` | `string` | auto-detected | Base URL for proxied API calls |

### Dev workflow / hot reload

- Pass `documentFactory: () => SwaggerModule.createDocument(app, config)` to `McpModule.setup()`.
- On each `POST /mcp` request (throttled by `hotReloadTtlMs`), the service re-runs the factory and regenerates tools. Because the transport is stateless and every request already creates a fresh `McpServer`, the next MCP call picks up new endpoints with **zero client reconnect**.
- This is most useful when routes change *within* a running process (dynamic controllers, HMR). With `ts-node-dev --respawn` / `nest start --watch` the whole process restarts and the spec is rebuilt at bootstrap anyway — the stateless transport still means clients don't need to reconnect.
- For explicit triggers, `POST /mcp/refresh` calls `refreshTools()` and returns `{ added, removed, total }`. Set `adminRefreshToken` to require a header (`x-mcp-refresh-token`) on that endpoint.
- `hotReload` auto-disables when `NODE_ENV === 'production'`; set it explicitly to override.

## Examples

### Tag Filtering

Only expose specific endpoints:

```ts
McpModule.forRoot({
  name: 'my-api',
  includeTags: ['tasks', 'users'],  // only these tags become tools
})
```

Or exclude certain tags:

```ts
McpModule.forRoot({
  name: 'my-api',
  excludeTags: ['admin', 'internal'],
})
```

### Token Optimization

Reduce tokens used by LLM clients when listing tools:

```ts
McpModule.forRoot({
  name: 'my-api',
  tokenOptimization: {
    compactSchemas: true,          // strip examples, descriptions from input schemas
    maxDescriptionLength: 100,     // truncate long operation summaries
  },
})
```

### Header Forwarding

Forward auth headers from MCP requests to your API:

```ts
McpModule.forRoot({
  name: 'my-api',
  forwardHeaders: ['authorization', 'x-api-key'],
})
```

### Custom Tool Naming

By default, tools are named from `operationId` (if set) or `{tag}_{method}` pattern. Override with `nameFormatter`:

```ts
McpModule.forRoot({
  name: 'my-api',
  nameFormatter: ({ method, path, tags, operationId }) => {
    if (operationId) return operationId;
    return `${tags[0]}_${method}_${path.replace(/[/{}]/g, '_')}`;
  },
})
```

### Async Configuration

Use `forRootAsync` when config depends on other services:

```ts
McpModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    name: config.get('MCP_SERVER_NAME'),
    includeTags: config.get('MCP_TAGS')?.split(','),
  }),
  inject: [ConfigService],
})
```

### Disable in Production

```ts
@Module({
  imports: [
    ...(process.env.NODE_ENV !== 'production'
      ? [McpModule.forRoot({ name: 'my-api' })]
      : []),
  ],
})
export class AppModule {}
```

And skip `McpModule.setup()` with the same check in `main.ts`.

## How It Works

1. `McpModule.setup()` reads the OpenAPI document you already built with `SwaggerModule.createDocument()`
2. Each operation becomes an MCP tool (name from `operationId` or `{tag}_{method}`)
3. Tool input schemas are derived from path params, query params, and request body
4. A `POST /mcp` endpoint serves MCP Streamable HTTP (JSON-RPC 2.0)
5. When an AI calls a tool, the library proxies the request to your local API

Hot-reload works with `nest start --watch` — tools regenerate on restart.

## Exports

```ts
import { McpModule, openApiToTools, jsonSchemaToZod } from 'nestjs-swagger-mcp';
import type {
  McpModuleOptions,
  McpModuleAsyncOptions,
  McpSetupOptions,
  ToolDefinition,
  OpenApiToToolsOptions,
  JsonSchemaProperty,
} from 'nestjs-swagger-mcp';
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and PR guidelines.

## License

[MIT](LICENSE)
