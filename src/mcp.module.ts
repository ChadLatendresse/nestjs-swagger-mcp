import { DynamicModule, Module, Type, type INestApplication } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';
import { MCP_MODULE_OPTIONS, type McpModuleOptions, type McpSetupOptions } from './mcp-config';

export interface McpModuleAsyncOptions {
  imports?: Array<Type | DynamicModule>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => Promise<McpModuleOptions> | McpModuleOptions;
  inject?: any[];
}

@Module({})
export class McpModule {
  static forRoot(options: McpModuleOptions): DynamicModule {
    return {
      module: McpModule,
      controllers: [McpController],
      providers: [
        { provide: MCP_MODULE_OPTIONS, useValue: options },
        McpServerService,
      ],
    };
  }

  static forRootAsync(options: McpModuleAsyncOptions): DynamicModule {
    return {
      module: McpModule,
      imports: options.imports ?? [],
      controllers: [McpController],
      providers: [
        {
          provide: MCP_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        McpServerService,
      ],
    };
  }

  static async setup(
    app: INestApplication,
    options: McpSetupOptions,
  ): Promise<void> {
    const service = app.get(McpServerService);
    const baseUrl = options.baseUrl ?? (await app.getUrl());
    service.initialize(options.document, baseUrl);
  }
}
