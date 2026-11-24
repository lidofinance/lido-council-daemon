import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { isReady } from './readiness';

/**
 * Answers 200 after the guardian start sequence has finished, and 503 before
 * that. It does not check the RPC or the Keys API.
 */
@Controller('ready')
export class ReadyController {
  @Get()
  check(): { status: 'ok' } {
    if (!isReady()) {
      throw new ServiceUnavailableException('The daemon is starting');
    }
    return { status: 'ok' };
  }
}
