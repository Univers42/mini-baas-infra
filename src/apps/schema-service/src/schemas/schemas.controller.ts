import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AuthGuard, CurrentUser, UserContext } from '@mini-baas/common';
import { SchemasService } from './schemas.service';
import { CreateSchemaDto } from './dto/schema.dto';

@ApiTags('schemas')
@Controller('schemas')
@UseGuards(AuthGuard)
export class SchemasController {
  constructor(private readonly service: SchemasService) {}

  @Post()
  @ApiOperation({ summary: 'Create a table/collection from a unified schema spec' })
  async create(@CurrentUser() user: UserContext, @Body() dto: CreateSchemaDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all schemas created by the current user' })
  async list(@CurrentUser() user: UserContext) {
    return this.service.list(user.id);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOperation({ summary: 'Drop a schema (table/collection) and remove from registry' })
  async drop(
    @CurrentUser() user: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.drop(user.id, id);
  }
}
