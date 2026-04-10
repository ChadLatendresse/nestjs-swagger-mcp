# Contributing to nestjs-swagger-mcp

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

```bash
git clone https://github.com/ChadLatendresse/nestjs-swagger-mcp.git
cd nestjs-swagger-mcp
npm install
npm run build
npm test
```

### Prerequisites

- Node.js 18+
- npm 9+

## Project Structure

```
src/
  index.ts                  # Public barrel exports
  mcp.module.ts             # NestJS module with forRoot/forRootAsync/setup
  mcp.controller.ts         # POST /mcp endpoint
  mcp-server.service.ts     # MCP server lifecycle and HTTP proxy
  mcp-config.ts             # Configuration interfaces and injection token
  openapi-to-tools.ts       # OpenAPI document to MCP tool definitions
  json-schema-to-zod.ts     # JSON Schema to Zod converter
test/
  openapi-to-tools.spec.ts  # Tool mapping tests
  json-schema-to-zod.spec.ts # Schema conversion tests
  mcp-server.service.spec.ts # Service tests
```

## Making Changes

1. **Fork and branch** from `main`
2. **Write tests first** --- we follow TDD
3. **Run the full test suite** before submitting:
   ```bash
   npm test
   npm run build
   ```
4. **Keep commits focused** --- one logical change per commit

## Testing

```bash
# Run all tests
npm test

# Run a specific test file
npx jest test/openapi-to-tools.spec.ts --no-cache

# Run tests matching a pattern
npx jest --no-cache -t "should handle allOf"
```

## Code Style

- TypeScript strict mode is enabled
- Follow existing patterns in the codebase
- Minimize `any` --- use proper types, `unknown`, or type narrowing
- Keep files focused --- one responsibility per file
- Export only what consumers need from `index.ts`

## Pull Request Guidelines

- **Title**: Short, descriptive (e.g., "feat: add oneOf schema support")
- **Description**: Explain what and why, not how (the code shows how)
- **Tests**: Every PR must include tests for new/changed behavior
- **Breaking changes**: Clearly document in PR description and CHANGELOG

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `refactor:` code change that doesn't fix a bug or add a feature
- `test:` adding or updating tests
- `docs:` documentation only
- `chore:` maintenance tasks

## Reporting Issues

- Use the [bug report template](https://github.com/ChadLatendresse/nestjs-swagger-mcp/issues/new?template=bug_report.md) for bugs
- Use the [feature request template](https://github.com/ChadLatendresse/nestjs-swagger-mcp/issues/new?template=feature_request.md) for ideas
- Include your NestJS version, Node version, and a minimal reproduction

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
