# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-04-09

### Added

- `oneOf` and `anyOf` schema composition support — properties from all sub-schemas are merged into the tool input
- Sibling `properties` alongside `allOf`/`oneOf`/`anyOf` are now included in the tool schema
- Enum value merging for discriminator fields in `oneOf`/`anyOf` unions

### Fixed

- Circular `$ref` no longer causes stack overflow — detected and gracefully replaced with `{ type: "object" }`
- `oneOf`/`anyOf` body schemas no longer produce empty tool input schemas
- `allOf` with sibling `properties` (e.g. `{ allOf: [...], properties: { bonus: ... } }`) now includes all fields

## [0.2.0] - 2026-04-09

### Fixed

- Deep `$ref` resolution: nested object schemas (e.g. 3+ levels of `$ref`) are now recursively resolved instead of collapsing to `type: "string"`
- Top-level array request bodies (`@ApiBody({ type: [Dto] })`) now generate a proper `items` input property and send the array directly as the JSON body

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
