import { Test } from '@nestjs/testing';
import { McpServerService } from '../src/mcp-server.service';
import { MCP_MODULE_OPTIONS } from '../src/mcp-config';
import type { OpenAPIObject } from '@nestjs/swagger';

const minimalDoc = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0' },
  paths: {
    '/items': {
      get: {
        tags: ['items'],
        summary: 'List items',
        operationId: 'listItems',
        parameters: [],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
} as unknown as OpenAPIObject;

describe('McpServerService', () => {
  let service: McpServerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        McpServerService,
        {
          provide: MCP_MODULE_OPTIONS,
          useValue: { name: 'test-server', version: '1.0.0' },
        },
      ],
    }).compile();

    service = module.get(McpServerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw when handleRequest called before initialize', async () => {
    const mockReq = { headers: {}, body: {} } as any;
    const mockRes = {} as any;
    await expect(service.handleRequest(mockReq, mockRes)).rejects.toThrow(
      'McpServerService not initialized',
    );
  });

  it('should populate tools after initialize', () => {
    service.initialize(minimalDoc, 'http://localhost:3000');
    expect((service as any).tools).toHaveLength(1);
    expect((service as any).tools[0].name).toBe('listItems');
    expect((service as any).initialized).toBe(true);
  });

  it('should respect includeTags option', async () => {
    const module = await Test.createTestingModule({
      providers: [
        McpServerService,
        {
          provide: MCP_MODULE_OPTIONS,
          useValue: {
            name: 'test-server',
            includeTags: ['nonexistent'],
          },
        },
      ],
    }).compile();

    const filteredService = module.get(McpServerService);
    filteredService.initialize(minimalDoc, 'http://localhost:3000');
    expect((filteredService as any).tools).toHaveLength(0);
  });
});
