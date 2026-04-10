# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-04-09

### Added

- Auto-generate MCP tools from NestJS Swagger/OpenAPI specs
- `McpModule.forRoot()` and `McpModule.forRootAsync()` configuration
- `McpModule.setup()` for post-listen initialization
- Tag filtering (`includeTags` / `excludeTags`)
- Token optimization (`compactSchemas`, `maxDescriptionLength`)
- Header forwarding from MCP requests to API calls
- Custom tool naming via `nameFormatter`
- Recursive JSON Schema to Zod conversion (`jsonSchemaToZod`)
- `$ref` resolution in request bodies and parameters
- `allOf` schema composition support
- `enum` and `nullable` support in schema conversion
- Body/param name collision detection with warnings
- Pluggable logger interface
- `GET /mcp` returns 405 per MCP spec
- Streamable HTTP transport (stateless mode)
