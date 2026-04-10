import type { OpenAPIObject } from '@nestjs/swagger';
import type { OpenApiToToolsOptions } from './openapi-to-tools';

export const MCP_MODULE_OPTIONS = 'MCP_MODULE_OPTIONS';

export interface McpModuleOptions {
  name: string;
  version?: string;
  includeTags?: string[];
  excludeTags?: string[];
  forwardHeaders?: string[];
  nameFormatter?: OpenApiToToolsOptions['nameFormatter'];
  tokenOptimization?: OpenApiToToolsOptions['tokenOptimization'];
}

export interface McpSetupOptions {
  document: OpenAPIObject;
  baseUrl?: string;
}
