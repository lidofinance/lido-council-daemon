import { CronExpression } from '@nestjs/schedule';

export const GUARDIAN_DEPOSIT_RESIGNING_BLOCKS = 10;
export const GUARDIAN_DEPOSIT_JOB_NAME = 'guardian-deposit-job';
export const GUARDIAN_DEPOSIT_JOB_DURATION = CronExpression.EVERY_5_SECONDS;
