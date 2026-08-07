import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Daily check-ins (spec §3): the per-day answer table plus the worker columns
 * that schedule the prompt and drive its state machine.
 */
export class AddDailyCheckIn1754400300000 implements MigrationInterface {
  name = 'AddDailyCheckIn1754400300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_check_ins" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "day" varchar(10) NOT NULL,
        "nrs" integer,
        "worked" boolean,
        "liftedHeavy" boolean,
        "didExercises" boolean,
        "completedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_daily_check_ins" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_daily_check_in_user_day" UNIQUE ("userId", "day")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_daily_check_ins_user_day"
        ON "daily_check_ins" ("userId", "day")
    `);
    await queryRunner.query(`
      ALTER TABLE "workers"
        ADD COLUMN IF NOT EXISTS "checkInTime" varchar(5) NOT NULL DEFAULT '19:30',
        ADD COLUMN IF NOT EXISTS "dailyCheckInStep" varchar(24),
        ADD COLUMN IF NOT EXISTS "lastDailyCheckInDate" varchar(10)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workers"
        DROP COLUMN IF EXISTS "checkInTime",
        DROP COLUMN IF EXISTS "dailyCheckInStep",
        DROP COLUMN IF EXISTS "lastDailyCheckInDate"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_check_ins"`);
  }
}
