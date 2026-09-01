import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/**
 * GHS impact dashboard API. Read-only reporting over the event log.
 * (Add auth before exposing publicly — omitted here for the demo.)
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboard.summary();
  }

  @Get('callbacks')
  callbacks() {
    return this.dashboard.callbacks();
  }

  /** Ranked follow-up list: every open distress signal, not just callbacks. */
  @Get('outreach')
  outreach() {
    return this.dashboard.outreach();
  }
}
