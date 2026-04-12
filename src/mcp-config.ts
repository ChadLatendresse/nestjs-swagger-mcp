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
  /**
   * Re-derive the OpenAPI spec on every incoming MCP request so tool
   * definitions reflect the latest code without a client reconnect.
   * Defaults to true when NODE_ENV !== 'production'.
   */
  hotReload?: boolean;
  /**
   * Minimum ms between hot-reload rescans. Bursty requests within this
   * window reuse the last scan. Defaults to 1000.
   */
  hotReloadTtlMs?: number;
  /**
   * Expose POST /mcp/refresh to force a tool rescan. Defaults to the
   * same value as hotReload.
   */
  adminRefresh?: boolean;
  /**
   * If set, `POST /mcp/refresh` requires header `x-mcp-refresh-token`
   * to match this value. Recommended whenever the endpoint is exposed.
   */
  adminRefreshToken?: string;
}

export type DocumentFactory = () => OpenAPIObject;

export interface McpSetupOptions {
  /** Either a pre-built document or a factory that rebuilds it on demand. */
  document?: OpenAPIObject;
  documentFactory?: DocumentFactory;
  baseUrl?: string;
}
