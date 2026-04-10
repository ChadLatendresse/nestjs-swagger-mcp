import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { McpServerService } from './mcp-server.service';

@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpServerService: McpServerService) {}

  @Post()
  async handleMcp(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpServerService.handleRequest(req, res);
  }

  @Get()
  handleGet(@Res() res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST.' },
      id: null,
    });
  }
}
