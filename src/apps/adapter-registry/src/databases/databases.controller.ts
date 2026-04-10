import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiSecurity } from '@nestjs/swagger';
import { AuthGuard, CurrentUser, Roles, RolesGuard, ServiceTokenGuard, UserContext } from '@mini-baas/common';
import { DatabasesService } from './databases.service';
import { RegisterDatabaseDto } from './dto/register-database.dto';

@ApiTags('databases')
@Controller('databases')
export class DatabasesController {
  constructor(private readonly service: DatabasesService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Register a database — encrypts and stores the connection string' })
  async register(
    @CurrentUser() user: UserContext,
    @Body() dto: RegisterDatabaseDto,
  ) {
    return this.service.register(user.id, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List all registered databases for the current user' })
  async list(@CurrentUser() user: UserContext) {
    return this.service.listAll(user.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOperation({ summary: 'Get a single database metadata (no connection string)' })
  async findOne(
    @CurrentUser() user: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.id, id);
  }

  @Get(':id/connect')
  @UseGuards(ServiceTokenGuard)
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiSecurity('service-token')
  @ApiOperation({ summary: 'Internal — decrypt and return connection string (service token or user)' })
  async connect(
    @CurrentUser() user: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getConnectionString(user.id, id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('service_role')
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOperation({ summary: 'Admin-only — delete a registered database' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return { deleted: true };
  }
}
